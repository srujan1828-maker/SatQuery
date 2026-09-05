import asyncio
import struct
from datetime import date
from urllib.parse import parse_qs, urlparse

import httpx
from fastapi.testclient import TestClient

from app.main import app
from app.models import Location, QueryRequest
from app.services import Sentinel1Scene, SentinelScene, Settings, geochat_answer, geochat_infer_url, inference_image, sentinel_tile_url

client = TestClient(app)


def test_vqa_matches_contract_b(monkeypatch) -> None:
    async def scene(*_args: object) -> SentinelScene:
        return SentinelScene("S2A_TEST_SCENE", date(2024, 5, 12), "https://imagery.example/scene.png")

    async def imagery(*_args: object) -> tuple[bytes, str]:
        return inference_image(), "image/png"

    monkeypatch.setattr("app.services.sentinel_scene", scene)
    monkeypatch.setattr("app.services.imagery_for_inference", imagery)
    response = client.post("/api/query", json={"query": "What is here?", "location": {"lat": 28.6, "lon": 77.2}, "date": "2024-05-12", "mode": "vqa"})
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "vqa"
    assert len(body["images"]) == 1
    assert body["images"][0]["role"] == "single"
    assert body["error"] is None


def test_change_requires_date_range_as_shaped_error() -> None:
    response = client.post("/api/query", json={"query": "compare", "location": {"lat": 28.6, "lon": 77.2}, "mode": "change_detection"})
    assert response.status_code == 200
    assert response.json()["error"]["code"] == "invalid_query"
    assert response.json()["confidence_flag"] == "uncertain"


def test_fusion_is_cached_and_needs_no_location() -> None:
    response = client.post("/api/query", json={"query": "show the flood demo", "mode": "fusion_demo"})
    body = response.json()
    assert response.status_code == 200
    assert [item["role"] for item in body["images"]] == ["optical", "radar"]
    assert body["used_cache_fallback"] is True


def test_settings_read_optional_service_environment(monkeypatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setenv("GEOCHAT_ENDPOINT_URL", "https://geochat.example")
    monkeypatch.setenv("FRONTEND_URL", "https://frontend.example/,https://custom.example")
    settings = Settings.from_environment()
    assert settings.gemini_api_key == "test-gemini-key"
    assert settings.geochat_url == "https://geochat.example"
    assert settings.geochat_timeout_seconds == 90
    assert settings.geochat_attempts == 2
    assert settings.frontend_origins == ("https://frontend.example", "https://custom.example")


def test_query_request_resolves_date_annotation() -> None:
    request = QueryRequest.model_validate({"query": "What is here?", "date": "2024-05-12"})
    assert request.date.isoformat() == "2024-05-12"


def test_geochat_endpoint_accepts_base_or_infer_url() -> None:
    assert geochat_infer_url("https://geochat.example") == "https://geochat.example/infer"
    assert geochat_infer_url("https://geochat.example/infer/") == "https://geochat.example/infer"


def test_inference_image_is_a_model_sized_rgb_png() -> None:
    image = inference_image()

    assert image.startswith(b"\x89PNG\r\n\x1a\n")
    assert image[12:16] == b"IHDR"
    assert struct.unpack(">II", image[16:24]) == (512, 512)
    assert image[25] == 2  # RGB color type


def test_sentinel_tile_url_is_centered_on_the_requested_location() -> None:
    url = sentinel_tile_url("S2A_TEST_SCENE", Location(lat=28.6139, lon=77.2090))
    query = parse_qs(urlparse(url).query)

    assert url.startswith("https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/14/")
    assert "@2x" in url
    assert query["collection"] == ["sentinel-2-l2a"]
    assert query["item"] == ["S2A_TEST_SCENE"]
    assert query["assets"] == ["visual"]


def test_geochat_retries_a_transient_connection_failure(monkeypatch) -> None:
    class RetryingClient:
        attempts = 0

        async def __aenter__(self) -> "RetryingClient":
            return self

        async def __aexit__(self, *_args: object) -> None:
            return None

        async def post(self, *_args: object, **_kwargs: object):
            RetryingClient.attempts += 1
            if RetryingClient.attempts == 1:
                raise httpx.ConnectError("temporary tunnel error")
            return httpx.Response(
                200,
                json={"answer": "A model response", "model_confident": True, "boxes": []},
                request=httpx.Request("POST", "https://geochat.example/infer"),
            )

    async def no_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr("app.services.httpx.AsyncClient", lambda **_kwargs: RetryingClient())
    monkeypatch.setattr("app.services.asyncio.sleep", no_sleep)
    settings = Settings(
        geochat_url="https://geochat.example",
        geochat_timeout_seconds=1,
        geochat_attempts=2,
        gemini_api_key=None,
        frontend_origins=(),
        demo_mode=False,
    )

    answer, boxes, confident, error = asyncio.run(geochat_answer("What is here?", settings))

    assert RetryingClient.attempts == 2
    assert answer == "A model response"
    assert confident is True
    assert error is None


def test_fusion_with_location_and_date_queries_optical_and_radar(monkeypatch) -> None:
    async def optical_scene(*_args: object) -> SentinelScene:
        return SentinelScene("S2A_TEST_OPTICAL", date(2024, 5, 12), "https://imagery.example/optical.png")

    async def radar_scene(*_args: object) -> Sentinel1Scene:
        return Sentinel1Scene("S1A_TEST_RADAR", date(2024, 5, 13), "https://imagery.example/radar.png")

    async def imagery(*_args: object) -> tuple[bytes, str]:
        return inference_image(), "image/png"

    monkeypatch.setattr("app.services.sentinel_scene", optical_scene)
    monkeypatch.setattr("app.services.sentinel1_scene", radar_scene)
    monkeypatch.setattr("app.services.imagery_for_inference", imagery)

    response = client.post(
        "/api/query",
        json={
            "query": "Analyze flood extent using optical and radar fusion",
            "location": {"lat": 28.6139, "lon": 77.2090, "name": "New Delhi"},
            "date": "2024-05-12",
            "mode": "fusion_demo",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "fusion_demo"
    assert body["used_cache_fallback"] is False
    roles = [img["role"] for img in body["images"]]
    assert "optical" in roles
    assert "radar" in roles


def test_change_detection_routes_to_geochat(monkeypatch) -> None:
    async def scene(loc, target_date: date) -> SentinelScene:
        return SentinelScene(f"S2A_{target_date}", target_date, f"https://imagery.example/{target_date}.png")

    async def imagery(*_args: object) -> tuple[bytes, str]:
        return inference_image(), "image/png"

    async def mock_geochat(prompt, settings, *args, **kwargs):
        return "Kedarnath shows significant debris clearance.", [{"x_min": 0.3, "y_min": 0.3, "x_max": 0.7, "y_max": 0.7, "label": "cleared zone"}], True, None

    monkeypatch.setattr("app.services.sentinel_scene", scene)
    monkeypatch.setattr("app.services.imagery_for_inference", imagery)
    monkeypatch.setattr("app.services.geochat_answer", mock_geochat)

    response = client.post(
        "/api/query",
        json={
            "query": "Detect debris changes between baseline and current observation",
            "location": {"lat": 30.7346, "lon": 79.0669, "name": "Kedarnath"},
            "date_range": {"start": "2013-05-01", "end": "2024-05-01"},
            "mode": "change_detection",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "change_detection"
    assert "debris clearance" in body["answer_text"]
    assert "debris clearance" in body["change_summary"]
    assert body["confidence_flag"] == "high"
    assert len(body["overlay_boxes"]) > 0


def test_change_detection_routes_to_gemini_if_geochat_unconfigured(monkeypatch) -> None:
    async def scene(loc, target_date: date) -> SentinelScene:
        return SentinelScene(f"S2A_{target_date}", target_date, f"https://imagery.example/{target_date}.png")

    async def imagery(*_args: object) -> tuple[bytes, str]:
        return inference_image(), "image/png"

    async def mock_gemini(*args, **kwargs):
        return "Gemini Vision detected flood inundation receding.", [{"x_min": 0.2, "y_min": 0.2, "x_max": 0.8, "y_max": 0.8, "label": "water receding"}], True

    monkeypatch.setenv("GEMINI_API_KEY", "fake-key")
    monkeypatch.setattr("app.services.sentinel_scene", scene)
    monkeypatch.setattr("app.services.imagery_for_inference", imagery)
    monkeypatch.setattr("app.services.gemini_answer", mock_gemini)

    response = client.post(
        "/api/query",
        json={
            "query": "Assess water receding",
            "location": {"lat": 26.1856, "lon": 91.7483, "name": "Brahmaputra"},
            "date_range": {"start": "2023-06-01", "end": "2024-06-01"},
            "mode": "change_detection",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "change_detection"
    assert "Gemini Vision detected" in body["answer_text"]
    assert body["confidence_flag"] == "high"

