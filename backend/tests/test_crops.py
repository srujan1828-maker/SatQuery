"""Synthetic fixtures test software behavior only, not agricultural accuracy."""
import numpy as np
import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient
from app import crops
from app.main import app


def study():
    rng = np.random.default_rng(71)
    rows = []
    for year in range(2018, 2024):
        for district in range(8):
            n = float(rng.uniform(0.2, 0.8))
            rows.append(dict(district=f"D{district}", year=year, yield_t_ha=1+8*n,
                             vv_early_db=-20+10*n, vh_early_db=-28+10*n,
                             vv_late_db=-18+10*n, vh_late_db=-25+10*n,
                             ndvi_mean=n, rain_mm=400+200*n, temperature_c=20+5*n))
    return dict(crop="rice", season="test season", region="synthetic test region", forecast_day=90,
                radar_processing="calibrated_rtc_db", observation_source="Synthetic test measurements only",
                yield_source="Synthetic test labels only", protocol="Fixed test windows and crop mask; software test only",
                historical=rows, target=dict(district="D0", year=2024, harvested_area_ha=100,
                                             vv_early_db=-15, vh_early_db=-23, vv_late_db=-13,
                                             vh_late_db=-20, ndvi_mean=0.5, rain_mm=500, temperature_c=22.5))


def test_evaluation_holds_out_years_and_returns_units():
    result = crops.evaluate(crops.CropStudy.model_validate(study()))
    assert result["status"] == "experimental_estimate"
    assert result["mae_t_ha"] < result["baseline_mae_t_ha"]
    assert result["production_t"] == pytest.approx(result["yield_t_ha"]*100)
    assert all(f["train_through"] < f["test_year"] for f in result["validation_folds"])
    assert [f["test_year"] for f in result["validation_folds"]] == [2021, 2022, 2023]
    assert len(result["dataset_sha256"]) == 64


def test_training_never_sees_future_years(monkeypatch):
    original = crops.fit_predict
    def check(train, targets):
        assert max(r.year for r in train) < min(r.year for r in targets)
        return original(train, targets)
    monkeypatch.setattr(crops, "fit_predict", check)
    crops.evaluate(crops.CropStudy.model_validate(study()))


def test_withholds_extrapolation():
    body = study()
    body["target"]["rain_mm"] = 2000
    result = crops.evaluate(crops.CropStudy.model_validate(body))
    assert result["status"] == "withheld"
    assert result["yield_t_ha"] is None and result["production_t"] is None
    assert any("training ranges" in r for r in result["withheld_reasons"])


def test_withholds_model_that_loses_to_baseline(monkeypatch):
    monkeypatch.setattr(crops, "fit_predict", lambda train, targets: np.full(len(targets), 90.0))
    result = crops.evaluate(crops.CropStudy.model_validate(study()))
    assert result["yield_t_ha"] is None
    assert any("baseline" in r for r in result["withheld_reasons"])


@pytest.mark.parametrize("change", ["duplicate", "future", "unknown_district", "nonfinite", "too_few", "uncalibrated"])
def test_rejects_invalid_training_data(change):
    body = study()
    if change == "duplicate": body["historical"][1] = body["historical"][0]
    if change == "future": body["target"]["year"] = 2022
    if change == "unknown_district": body["target"]["district"] = "unseen"
    if change == "nonfinite": body["historical"][0]["ndvi_mean"] = float("nan")
    if change == "too_few": body["historical"] = body["historical"][:10]
    if change == "uncalibrated": body["radar_processing"] = "display_png"
    with pytest.raises(ValidationError): crops.CropStudy.model_validate(body)


def test_crop_api_and_no_area():
    body = study()
    del body["target"]["harvested_area_ha"]
    with TestClient(app) as client:
        response = client.post("/api/crops/evaluate", json=body)
    assert response.status_code == 200
    assert response.json()["production_t"] is None
