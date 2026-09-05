from __future__ import annotations

from datetime import date
from html import escape

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.models import QueryRequest, QueryResponse
from app.services import SENTINEL_TILE_URL, Settings, handle_query

app = FastAPI(title="SatQuery API", version="0.1.0")

settings = Settings.from_environment()
# Allow all origins so local preview, Vercel deployments, and custom domains connect without CORS issues
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def unavailable_sentinel_tile() -> Response:
    """Return a visible image instead of a broken browser image icon."""
    svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600" role="img" aria-label="Sentinel image unavailable">
<rect width="960" height="600" fill="#17212b"/><path d="M0 430C170 330 330 500 510 385S770 290 960 410V600H0Z" fill="#254d5b"/>
<text x="48" y="80" fill="#f5f7fa" font-family="system-ui" font-size="30" font-weight="700">Sentinel-2 image unavailable</text>
<text x="48" y="124" fill="#c9d3dc" font-family="system-ui" font-size="22">The public tile source did not return a renderable scene.</text></svg>'''
    return Response(svg, media_type="image/svg+xml", headers={"Cache-Control": "no-store"})


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/query", response_model=QueryResponse)
async def query(request: QueryRequest) -> QueryResponse:
    # Expected operational failures are represented by the Contract B error field.
    return await handle_query(request)


@app.get("/media/sentinel.png")
async def sentinel_media(source: str) -> Response:
    """Proxy approved public Sentinel tiles so browser CORS/auth never hides evidence."""
    if not (source.startswith("https://planetarycomputer.microsoft.com/") or source.startswith(SENTINEL_TILE_URL)):
        return unavailable_sentinel_tile()
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            upstream = await client.get(source)
            upstream.raise_for_status()
        content_type = upstream.headers.get("content-type", "image/png").split(";", 1)[0]
        if not content_type.startswith("image/") or not upstream.content:
            return unavailable_sentinel_tile()
        return Response(
            upstream.content,
            media_type=content_type,
            headers={"Cache-Control": "public, max-age=86400"},
        )
    except httpx.HTTPError:
        return unavailable_sentinel_tile()


@app.get("/media/{image_id}.svg")
async def media(image_id: str) -> Response:
    """Self-contained demo imagery so Contract C can render without external media hosting."""
    safe_id = escape(image_id)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600" role="img" aria-label="Satellite demo image {safe_id}">
<defs><linearGradient id="land" x2="1" y2="1"><stop stop-color="#264c3f"/><stop offset="1" stop-color="#8a9d5d"/></linearGradient></defs>
<rect width="960" height="600" fill="url(#land)"/><path d="M0 390 C190 290 290 490 440 365 S730 265 960 410 L960 600 L0 600Z" fill="#1f6071" opacity=".88"/>
<path d="M65 100 L310 170 L240 300 L30 225Z M650 60 L890 110 L820 265 L590 210Z" fill="#c3bb75" opacity=".7"/>
<g stroke="#d8ddaa" stroke-width="7" opacity=".35"><path d="M120 0L510 600"/><path d="M510 0L800 600"/></g><text x="38" y="70" fill="white" font-family="system-ui" font-size="27" font-weight="600">{safe_id}</text></svg>'''
    return Response(svg, media_type="image/svg+xml")
