"""Single-host durable job records with isolated, cancellable analysis workers."""

import asyncio
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timezone
import json
import os
import re
import sqlite3
import sys
import time
import uuid
from urllib.parse import urlsplit
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from app.models import QueryRequest
from app.crops import router as crop_router
from app.imagery import DATA_DIR, ARTIFACTS, prune_artifacts
from app.services import geocode_search

DB = DATA_DIR / "jobs.sqlite3"
TASKS = {}
MAX_JOBS = int(os.getenv("MAX_ACTIVE_JOBS", "2"))
DEADLINE = int(os.getenv("ANALYSIS_TIMEOUT_SECONDS", "240"))


@contextmanager
def db():
    con = sqlite3.connect(DB, timeout=10)
    con.row_factory = sqlite3.Row
    try:
        with con:
            yield con
    finally:
        con.close()


@asynccontextmanager
async def lifespan(app):
    prune_artifacts()
    with db() as con:
        con.execute(
            "CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, status TEXT, created REAL, request TEXT, result TEXT, message TEXT)"
        )
        con.execute("CREATE TABLE IF NOT EXISTS budget (client TEXT, stamp REAL)")
        con.execute(
            "UPDATE jobs SET status='failed', message='Worker restarted. Please retry.' WHERE status IN ('queued','running')"
        )
    yield
    tasks = list(TASKS.values())
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


app = FastAPI(title="SatQuery Evidence API", version="0.2.0", lifespan=lifespan)
app.include_router(crop_router)
def frontend_origins(value):
    origins = []
    for entry in value.split(","):
        entry = entry.strip()
        if not entry:
            continue
        url = urlsplit(entry)
        if url.scheme not in {"http", "https"} or not url.hostname or url.username or url.password or "*" in entry:
            raise ValueError("FRONTEND_URL must contain comma-separated HTTP(S) URLs, not wildcards")
        # Browsers send only scheme + host + port, never paths or query strings.
        port = url.port
        host = f"[{url.hostname}]" if ":" in url.hostname else url.hostname
        suffix = f":{port}" if port and (url.scheme, port) not in {("https", 443), ("http", 80)} else ""
        origins.append(f"{url.scheme}://{host}{suffix}")
    return list(dict.fromkeys(origins))


origins = frontend_origins(os.getenv(
    "FRONTEND_URL",
    "https://sat-query-six.vercel.app,http://localhost:5173,http://127.0.0.1:5173",
))
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)


def update(job_id, **fields):
    with db() as con:
        con.execute(
            "UPDATE jobs SET " + ",".join(f"{key}=?" for key in fields) + " WHERE id=?",
            (*fields.values(), job_id),
        )


async def execute(job_id, body):
    process = None
    try:
        update(
            job_id,
            status="running",
            message="Selecting and reading verified source observations…",
        )
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "app.worker",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(
            process.communicate(body.encode()), timeout=DEADLINE
        )
        if process.returncode:
            raise RuntimeError(
                "An upstream source or processing service failed. Please retry."
            )
        result = json.loads(stdout)
        update(
            job_id, status="succeeded", result=json.dumps(result), message="Finished"
        )
    except asyncio.CancelledError:
        update(job_id, status="cancelled", message="Cancelled")
        raise
    except asyncio.TimeoutError:
        update(
            job_id,
            status="failed",
            message="Analysis exceeded its processing deadline. Reduce the area or retry.",
        )
    except Exception:
        update(
            job_id,
            status="failed",
            message="Unable to complete source processing. No synthetic result was substituted.",
        )
    finally:
        if process and process.returncode is None:
            process.kill()
            await process.wait()
        TASKS.pop(job_id, None)


@app.get("/health")
async def health():
    return {"status": "ok", "pipeline": "aoi-scl-screening-v1"}


@app.post("/api/jobs", status_code=202)
async def submit(body: QueryRequest, request: Request):
    # IP budget is an abuse backstop, not account authentication. Deploy behind a trusted proxy.
    await asyncio.to_thread(prune_artifacts)
    client = request.client.host if request.client else "unknown"
    now = time.time()
    with db() as con:
        con.execute("BEGIN IMMEDIATE")
        con.execute("DELETE FROM budget WHERE stamp < ?", (now - 3600,))
        con.execute(
            "DELETE FROM jobs WHERE created < ? AND status NOT IN (?,?)",
            (now - 7 * 86400, "queued", "running"),
        )
        if (
            con.execute(
                "SELECT COUNT(*) FROM budget WHERE client=?", (client,)
            ).fetchone()[0]
            >= 20
        ):
            raise HTTPException(429, "Hourly query budget reached. Try later.")
        if (
            con.execute(
                "SELECT COUNT(*) FROM jobs WHERE status IN ('queued','running')"
            ).fetchone()[0]
            >= MAX_JOBS
        ):
            raise HTTPException(429, "Analysis capacity is full. Please retry shortly.")
        job_id = uuid.uuid4().hex
        payload = body.model_dump_json()
        con.execute(
            "INSERT INTO jobs VALUES (?,?,?,?,?,?)",
            (job_id, "queued", now, payload, None, "Queued"),
        )
        con.execute("INSERT INTO budget VALUES (?,?)", (client, now))
    TASKS[job_id] = asyncio.create_task(execute(job_id, payload))
    return {"id": job_id, "status": "queued"}


@app.get("/api/jobs/{job_id}")
async def status(job_id: str):
    with db() as con:
        row = con.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Job not found or expired")
    return {
        "id": job_id,
        "status": row["status"],
        "message": row["message"],
        "result": json.loads(row["result"]) if row["result"] else None,
        "created_at": datetime.fromtimestamp(row["created"], timezone.utc).isoformat(),
    }


@app.delete("/api/jobs/{job_id}")
async def cancel(job_id: str):
    task = TASKS.get(job_id)
    if task:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
    return await status(job_id)


@app.post("/api/query")
async def legacy():
    raise HTTPException(410, "Use POST /api/jobs and poll the returned job ID.")


GEOCODE_LOCK = asyncio.Lock()
GEOCODE_CACHE = {}
LAST_GEOCODE = 0.0


@app.get("/api/geocode")
async def geocode(q: str = ""):
    global LAST_GEOCODE
    q = q.strip()[:200]
    if len(q) < 2:
        return {"results": []}
    async with GEOCODE_LOCK:
        if q.casefold() in GEOCODE_CACHE:
            return {"results": GEOCODE_CACHE[q.casefold()]}
        await asyncio.sleep(max(0, 1.1 - (time.monotonic() - LAST_GEOCODE)))
        matches = await geocode_search(q)
        LAST_GEOCODE = time.monotonic()
        if len(GEOCODE_CACHE) > 500:
            GEOCODE_CACHE.clear()
        GEOCODE_CACHE[q.casefold()] = matches
        return {"results": matches}


@app.get("/media/artifacts/{filename}")
async def artifact(filename: str):
    if not re.fullmatch(r"[a-f0-9]{64}\.png", filename):
        raise HTTPException(404)
    path = ARTIFACTS / filename
    if not path.is_file():
        raise HTTPException(404, "Evidence artifact expired or missing")
    return FileResponse(
        path,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=604800, immutable"},
    )
