from datetime import date
import numpy as np
import pytest
from pydantic import ValidationError
from app import crop_auto as auto
from app.main import app, TASKS
from fastapi.testclient import TestClient


def request():
    return auto.AutoCropRequest(location={"lat": 0, "lon": 0}, crop="rice", sowing_date="2024-06-01", date="2024-09-01")


def test_weather_fill_values_and_missing_days(monkeypatch, tmp_path):
    monkeypatch.setattr(auto, "DATA_DIR", tmp_path)
    calls = []
    def source(*args, **kwargs):
        calls.append(kwargs)
        return {"properties": {"parameter": {"T2M": {"20240101": 22, "20240102": -999}, "PRECTOTCORR": {"20240101": 3, "20240102": -999}}}}
    monkeypatch.setattr(auto, "get_json", source)
    r = auto.weather(0, 0, date(2024, 1, 1), date(2024, 1, 2))
    assert r["status"] == "partial" and r["rain_mm"] is None
    assert r["available_rain_mm"] == 3 and r["temperature_c"] == 22
    assert calls[0]["params"]["end"] == "20240102"
    auto.weather(0, 0, date(2024, 1, 1), date(2024, 1, 2))
    assert len(calls) == 1


def scene(d, orbit=3):
    return {"id": d, "properties": {"datetime": d+"T12:00:00Z", "sat:relative_orbit": orbit, "sat:orbit_state": "ascending"}, "assets": {"vv": {}, "vh": {}}}


def test_only_observed_dates_and_consistent_radar_track():
    items = [scene("2024-06-10"), scene("2024-08-15"), scene("2024-08-17", 9), scene("2024-10-01")]
    selected = auto.select_scenes(items, date(2024, 6, 1), date(2024, 9, 1), True)
    assert [w for w, _ in selected] == ["early", "late"]
    assert all(i["properties"]["sat:relative_orbit"] == 3 for _, i in selected)
    assert not any(i["id"] == "2024-10-01" for _, i in selected)


def test_calibrated_radar_uses_power_to_db(monkeypatch):
    monkeypatch.setattr(auto, "read_asset", lambda i, band, t, s, **kw: np.ma.array(np.full((5, 5), 0.1 if band == "vv" else 0.01)))
    r = auto.radar_values({}, None, 5)
    assert r["vv_db"] == pytest.approx(-10) and r["vh_db"] == pytest.approx(-20)


def test_optical_requires_scale_and_offset_and_vegetation(monkeypatch):
    def read(i, band, t, s, **kw):
        return np.ma.array(np.full((5, 5), {"B04": 2000, "B08": 6000, "SCL": 4}[band]))
    monkeypatch.setattr(auto, "read_asset", read)
    item = {"assets": {b: {"raster:bands": [{"scale": 0.0001, "offset": -0.1}]} for b in ["B04", "B08"]}}
    assert auto.optical_values(item, None, 5)["ndvi"] == pytest.approx(2/3)
    item["assets"]["B04"]["raster:bands"][0].pop("offset")
    with pytest.raises((ValueError, KeyError)): auto.optical_values(item, None, 5)


def test_yield_provider_matches_exact_crop_units_and_historical_year(monkeypatch):
    monkeypatch.setenv("OGD_API_KEY", "test-only-key")
    monkeypatch.setenv("OGD_CROP_RESOURCE_ID", "12345678-1234-1234-1234-123456789abc")
    monkeypatch.setenv("OGD_CROP_UNITS", "hectares_tonnes")
    row = dict(state_name="Punjab", district_name="Ludhiana", crop="Rice", season="Kharif", crop_year="2023", area="100", production="400")
    monkeypatch.setattr(auto, "get_json", lambda *a, **kw: {"records": [row, {**row, "crop_year": "2024"}, {**row, "crop": "Wheat", "crop_year": "2022"}]})
    req = request().model_copy(update={"state": "Punjab", "district": "Ludhiana", "season": "Kharif"})
    result = auto.yield_history(req)
    assert len(result["records"]) == 1 and result["records"][0]["yield_t_ha"] == 4
    assert "test-only-key" not in str(result)


def test_partial_provider_failure_preserves_results_and_withholds_yield(monkeypatch, tmp_path):
    monkeypatch.setattr(auto, "DATA_DIR", tmp_path)
    monkeypatch.delenv("OGD_API_KEY", raising=False)
    monkeypatch.setattr(auto, "weather", lambda *a: {"status": "complete", "rain_mm": 30})
    def fail(*a): raise RuntimeError("secret upstream URL")
    monkeypatch.setattr(auto, "satellite_series", fail)
    r = auto.retrieve(request())
    assert r["seasons"][0]["weather"]["rain_mm"] == 30
    assert r["forecast"]["yield_t_ha"] is None
    assert r["status"] == "partial_context"
    assert "secret upstream URL" not in str(r)
    assert len(r["seasons"]) == 2


def test_auto_crop_uses_existing_job_queue(monkeypatch):
    import asyncio
    from app import main
    async def noop(*args): await asyncio.sleep(0)
    monkeypatch.setattr(main, "execute", noop)
    with TestClient(app) as client:
        response = client.post("/api/jobs", json=request().model_dump(mode="json"))
        assert response.status_code == 202
    TASKS.clear()


def test_reject_future_or_short_season():
    body = request().model_dump()
    body["date"] = date(2099, 1, 1)
    with pytest.raises(ValidationError): auto.AutoCropRequest.model_validate(body)
    body["date"] = date(2024, 6, 2)
    with pytest.raises(ValidationError): auto.AutoCropRequest.model_validate(body)


def test_product_xml_offsets_for_modern_and_legacy_baselines():
    xml = b'<root><BOA_QUANTIFICATION_VALUE>10000</BOA_QUANTIFICATION_VALUE><BOA_ADD_OFFSET band_id="3">-1000</BOA_ADD_OFFSET><BOA_ADD_OFFSET band_id="7">-1000</BOA_ADD_OFFSET></root>'
    assert auto.parse_boa_metadata(xml, "05.11")["B04"] == {"scale": 0.0001, "offset": -0.1}
    legacy = b'<root><BOA_QUANTIFICATION_VALUE>10000</BOA_QUANTIFICATION_VALUE></root>'
    assert auto.parse_boa_metadata(legacy, "03.00")["B08"]["offset"] == 0
    with pytest.raises(ValueError): auto.parse_boa_metadata(legacy, "05.11")
