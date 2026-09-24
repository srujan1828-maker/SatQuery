import asyncio
from datetime import date
from hashlib import sha256
from io import BytesIO
import numpy as np
import pytest
import rasterio
from PIL import Image
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app import main, pipeline, imagery
from app.models import QueryRequest, ImageResult
from app.imagery import Observation, EvidenceUnavailable, aoi_grid, water_change


def req(**changes):
    return QueryRequest.model_validate(
        {
            "query": "Inspect water",
            "location": {"lat": 0, "lon": 0},
            "date": "2024-05-12",
            **changes,
        }
    )


def obs(request, target, role, water=None):
    bbox, size, transform = aoi_grid(request)
    size = 4
    transform = rasterio.transform.from_bounds(*bbox, size, size)
    content = b"verified-fixture-bytes"
    image = ImageResult(
        id=role,
        url="/media/artifacts/" + sha256(content).hexdigest() + ".png",
        sensor="sentinel-2",
        date=target,
        role=role,
        scene_id=str(target),
        collection="sentinel-2-l2a",
        source_url="https://example.test/catalog",
        requested_date=target,
        date_offset_days=0,
        bbox=bbox,
        width=size,
        height=size,
        resolution_m=10,
        sha256=sha256(content).hexdigest(),
        usable_fraction=1,
        render_method="test fixture",
    )
    return Observation(
        image,
        content,
        np.ones((size, size), bool),
        np.zeros((size, size), bool) if water is None else water,
        transform,
    )


@pytest.fixture(autouse=True)
def isolated(monkeypatch, tmp_path):
    monkeypatch.delenv("GEOCHAT_ENDPOINT_URL", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(main, "DB", tmp_path / "jobs.db")
    monkeypatch.setattr(imagery, "ARTIFACTS", tmp_path)


def test_no_model_returns_only_verified_evidence(monkeypatch):
    monkeypatch.setattr(
        pipeline, "fetch_observation", lambda r, d, role: obs(r, d, role)
    )
    result = asyncio.run(pipeline.handle_query(req()))
    assert result.analysis_status == "partial"
    assert result.confidence_flag == "uncertain"
    assert result.overlay_boxes == []
    assert len(result.images) == 1


def test_missing_radar_is_not_replaced(monkeypatch):
    def fetch(r, d, role, radar=False):
        if radar:
            raise EvidenceUnavailable("No radar")
        return obs(r, d, role)

    monkeypatch.setattr(pipeline, "fetch_observation", fetch)
    result = asyncio.run(pipeline.handle_query(req(mode="fusion")))
    assert [i.role for i in result.images] == ["optical"]
    assert result.analysis_status == "partial"
    assert result.overlay_boxes == []
    assert "radar is unavailable" in result.answer_text


def test_missing_imagery_never_invokes_model(monkeypatch):
    def fail(*args):
        raise EvidenceUnavailable("No imagery")

    async def forbidden(*args, **kwargs):
        pytest.fail("Model must not run without evidence")

    monkeypatch.setattr(pipeline, "fetch_observation", fail)
    monkeypatch.setattr(pipeline, "geochat_answer", forbidden)
    result = asyncio.run(pipeline.handle_query(req()))
    assert not result.images
    assert result.analysis_status == "unavailable"


def test_paired_model_gets_both_inputs_and_language(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-only")

    def fetch(r, d, role):
        o = obs(r, d, role)
        o.content = role.encode()
        return o

    async def gemini(prompt, data, key, **kwargs):
        assert "Hindi" in prompt and data == b"after"
        assert kwargs["comparison_image_data"] == b"before"
        return "उत्तर", [], False

    async def forbidden(*args, **kwargs):
        pytest.fail("One-image GeoChat must not handle paired tasks")

    monkeypatch.setattr(pipeline, "fetch_observation", fetch)
    monkeypatch.setattr(pipeline, "gemini_answer", gemini)
    monkeypatch.setattr(pipeline, "geochat_answer", forbidden)
    result = asyncio.run(
        pipeline.handle_query(
            req(
                mode="change_detection",
                language="hi",
                date_range={"start": "2023-05-12", "end": "2024-05-12"},
            )
        )
    )
    assert result.answer_text == "उत्तर" and result.confidence_flag == "uncertain"
    assert not result.overlay_boxes


@pytest.mark.parametrize(
    "changes",
    [
        {"date": "2999-01-01"},
        {"location": {"lat": 90, "lon": 0}},
        {"location": {"lat": 0, "lon": 181}},
        {"query": " "},
        {"radius_km": 100},
        {
            "mode": "change_detection",
            "date_range": {"start": "2024-01-01", "end": "2024-01-01"},
        },
    ],
)
def test_invalid_queries(changes):
    with pytest.raises(ValidationError):
        req(**changes)


def test_zero_coordinates_and_dateline():
    bbox, size, _ = aoi_grid(req(radius_km=0.25))
    assert bbox[0] < 0 < bbox[2] and bbox[1] < 0 < bbox[3]
    assert size == 50
    with pytest.raises(EvidenceUnavailable):
        aoi_grid(req(location={"lat": 0, "lon": 180}))


def test_change_excludes_invalid_pixels_and_handles_unchanged():
    r = req()
    b = obs(r, date(2023, 1, 1), "before")
    a = obs(r, date(2024, 1, 1), "after")
    metrics, geo = water_change(b, a)
    assert metrics["water_gain_ha"] == 0 and geo["features"] == []
    a.water[0, 0] = True
    metrics, geo = water_change(b, a)
    assert (
        metrics["water_gain_ha"] > 0
        and geo["features"][0]["properties"]["change"] == "water_gain"
    )
    b.valid[0, 0] = False
    metrics, geo = water_change(b, a)
    assert metrics["water_gain_ha"] == 0 and not geo["features"]
    with pytest.raises(EvidenceUnavailable):
        water_change(a, a)


def test_wrong_grid_rejected():
    r = req()
    b = obs(r, date(2023, 1, 1), "before")
    a = obs(r, date(2024, 1, 1), "after")
    a.image.bbox = [1, 1, 2, 2]
    with pytest.raises(EvidenceUnavailable):
        water_change(b, a)


def test_real_local_raster_read_masks_and_hashes(monkeypatch, tmp_path):
    r = req(radius_km=0.25)
    bbox, size, t = aoi_grid(r)
    assets = {}
    for name, data in [
        ("visual", np.full((3, size, size), 120, dtype="uint8")),
        ("SCL", np.full((1, size, size), 6, dtype="uint8")),
    ]:
        if name == "SCL":
            data[0, :10, :] = 9
        path = tmp_path / f"{name}.tif"
        with rasterio.open(
            path,
            "w",
            driver="GTiff",
            width=size,
            height=size,
            count=data.shape[0],
            dtype="uint8",
            crs="EPSG:4326",
            transform=t,
        ) as dst:
            dst.write(data)
        assets[name] = {"href": str(path)}
    item = {
        "id": "local-fixture",
        "assets": assets,
        "properties": {"datetime": "2024-05-12T00:00:00Z"},
    }
    monkeypatch.setattr(imagery, "catalog_candidates", lambda *args: [item])
    monkeypatch.setattr(imagery.pc, "sign", lambda href: href)
    o = imagery.fetch_observation(r, r.date, "single")
    assert o.image.width == 50 and o.image.usable_fraction == 0.8
    assert sha256(o.content).hexdigest() == o.image.sha256
    assert (tmp_path / f"{o.image.sha256}.png").read_bytes() == o.content
    pixels = np.asarray(Image.open(BytesIO(o.content)))
    assert (
        (pixels[:10, :, 3] == 0).all()
        and (pixels[10:, :, 3] == 255).all()
        and not o.water[:10].any()
    )


def test_geocode_contract_and_artifact_restriction(monkeypatch):
    async def geocode(q):
        return [{"name": "Test", "lat": 0, "lon": 0}]

    monkeypatch.setattr(main, "geocode_search", geocode)
    main.GEOCODE_CACHE.clear()
    with TestClient(main.app) as client:
        assert client.get("/api/geocode?q=Test").json()["results"][0]["lat"] == 0
        assert client.get("/media/artifacts/anything.png").status_code == 404
        assert client.post("/api/query").status_code == 410


def test_job_lifecycle_and_cancel(monkeypatch):
    async def waiting(job_id, body):
        try:
            await asyncio.sleep(60)
        except asyncio.CancelledError:
            main.update(job_id, status="cancelled", message="Cancelled")
            raise
        finally:
            main.TASKS.pop(job_id, None)

    monkeypatch.setattr(main, "execute", waiting)
    with TestClient(main.app) as client:
        response = client.post("/api/jobs", json=req().model_dump(mode="json"))
        assert response.status_code == 202
        job = response.json()["id"]
        assert client.get(f"/api/jobs/{job}").json()["status"] == "queued"
        assert client.delete(f"/api/jobs/{job}").json()["status"] == "cancelled"
        assert client.get("/api/jobs/unknown").status_code == 404


def test_capacity_and_validation(monkeypatch):
    monkeypatch.setattr(main, "MAX_JOBS", 0)
    with TestClient(main.app) as client:
        assert (
            client.post("/api/jobs", json=req().model_dump(mode="json")).status_code
            == 429
        )
        assert client.post("/api/jobs", json={}).status_code == 422


def test_catalog_failure_is_explicit(monkeypatch):
    import httpx

    def fail(*args):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(imagery, "catalog_candidates", fail)
    with pytest.raises(EvidenceUnavailable, match="catalog"):
        imagery.fetch_observation(req(), date(2024, 5, 12), "single")


def test_timeout_terminates_worker(monkeypatch):
    class Process:
        returncode = None
        killed = False

        async def communicate(self, payload):
            await asyncio.sleep(60)

        def kill(self):
            self.killed = True
            self.returncode = -9

        async def wait(self):
            return self.returncode

    process = Process()

    async def create(*args, **kwargs):
        return process

    monkeypatch.setattr(main.asyncio, "create_subprocess_exec", create)
    monkeypatch.setattr(main, "DEADLINE", 0.01)

    async def exercise():
        async with main.lifespan(main.app):
            with main.db() as con:
                con.execute(
                    "INSERT INTO jobs VALUES (?,?,?,?,?,?)",
                    ("deadline", "queued", 0, "{}", None, ""),
                )
            await main.execute("deadline", "{}")
            with main.db() as con:
                assert (
                    con.execute(
                        "SELECT status FROM jobs WHERE id=?", ("deadline",)
                    ).fetchone()[0]
                    == "failed"
                )

    asyncio.run(exercise())
    assert process.killed


def test_frontend_origins_and_jobs_preflight():
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    origins = main.frontend_origins(" https://sat-query-six.vercel.app/path?lat=3,https://sat-query-six.vercel.app:443/ ")
    assert origins == ["https://sat-query-six.vercel.app"]
    app = FastAPI()
    app.add_middleware(CORSMiddleware, allow_origins=origins,
                       allow_methods=["GET", "POST", "DELETE"], allow_headers=["Content-Type"])
    with TestClient(app) as client:
        for method in ["POST", "DELETE"]:
            response = client.options("/api/jobs", headers={
                "Origin": origins[0], "Access-Control-Request-Method": method,
                "Access-Control-Request-Headers": "content-type"})
            assert response.status_code == 200
            assert response.headers["access-control-allow-origin"] == origins[0]
        assert client.options("/api/jobs", headers={"Origin": "https://untrusted.example", "Access-Control-Request-Method": "POST"}).status_code == 400
    with pytest.raises(ValueError):
        main.frontend_origins("https://*.vercel.app")


def test_nonwater_comparison_answers_question_without_water_screening(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-only")
    monkeypatch.setattr(pipeline, "fetch_observation", lambda r, d, role: obs(r, d, role))
    def no_water(*args): pytest.fail("Water measurements must not replace a vegetation question")
    monkeypatch.setattr(pipeline, "water_change", no_water)
    async def answer(prompt, *args, **kwargs):
        assert "vegetation" in prompt and "BEFORE" in prompt
        assert kwargs["comparison_image_data"] is not None
        return "Vegetation comparison", [], False
    monkeypatch.setattr(pipeline, "gemini_answer", answer)
    result = asyncio.run(pipeline.handle_query(req(query="Compare vegetation and urban growth", mode="change_detection", date_range={"start":"2023-05-12", "end":"2024-05-12"})))
    assert result.answer_text == "Vegetation comparison"
    assert result.metrics is None


def test_no_candidate_message_is_distinct(monkeypatch):
    monkeypatch.setattr(imagery, "catalog_candidates", lambda *args: [])
    with pytest.raises(EvidenceUnavailable, match="catalogue returned no scenes"):
        imagery._fetch_observation(req(), req().date, "single")


def test_rejected_coverage_is_counted_and_search_reaches_sixth_date(monkeypatch, tmp_path):
    monkeypatch.setattr(imagery, "ARTIFACTS", tmp_path)
    items = [{"id": str(i), "properties": {"datetime": f"2024-05-{i+10:02d}T00:00:00Z"}} for i in range(6)]
    monkeypatch.setattr(imagery, "catalog_candidates", lambda *args: items)
    def read(item, name, transform, size, *args, **kwargs):
        if name == "visual": return np.ma.array(np.full((3, size, size), 120, dtype="uint8"))
        return np.ma.array(np.full((size, size), 4 if item["id"] == "5" else 9, dtype="uint8"))
    monkeypatch.setattr(imagery, "read_asset", read)
    assert imagery._fetch_observation(req(), req().date, "single").image.scene_id == "5"
    monkeypatch.setattr(imagery, "catalog_candidates", lambda *args: items[:5])
    with pytest.raises(EvidenceUnavailable, match="5 had less than 50% usable coverage; 0 could not be read"):
        imagery._fetch_observation(req(), req().date, "single")
