from fastapi.testclient import TestClient

from app.main import app
from app.services import Settings

client = TestClient(app)


def test_vqa_matches_contract_b() -> None:
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
    settings = Settings.from_environment()
    assert settings.gemini_api_key == "test-gemini-key"
    assert settings.geochat_url == "https://geochat.example"
