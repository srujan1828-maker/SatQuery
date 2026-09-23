"""Experimental district crop forecasting from documented, user-supplied measurements.
No satellite display pixels, invented labels, or pretrained accuracy claims.
"""
from datetime import date
from hashlib import sha256
from typing import Literal
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

router = APIRouter(prefix="/api/crops", tags=["crop-outlook"])
FEATURES = ["vv_early_db", "vh_early_db", "vv_late_db", "vh_late_db", "ndvi_mean", "rain_mm", "temperature_c"]


class Measurements(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    vv_early_db: float = Field(ge=-60, le=20)
    vh_early_db: float = Field(ge=-60, le=20)
    vv_late_db: float = Field(ge=-60, le=20)
    vh_late_db: float = Field(ge=-60, le=20)
    ndvi_mean: float = Field(ge=-1, le=1)
    rain_mm: float = Field(ge=0, le=5000)
    temperature_c: float = Field(ge=-30, le=60)


class Season(Measurements):
    district: str = Field(min_length=1, max_length=100, pattern=r"\S")
    year: int = Field(ge=2015, le=2100)
    yield_t_ha: float = Field(gt=0, le=100)


class Target(Measurements):
    district: str = Field(min_length=1, max_length=100, pattern=r"\S")
    year: int = Field(ge=2015, le=2100)
    harvested_area_ha: float | None = Field(default=None, gt=0, le=10_000_000)


class CropStudy(BaseModel):
    model_config = ConfigDict(extra="forbid")
    crop: Literal["rice", "wheat", "maize"]
    season: str = Field(min_length=1, max_length=60)
    region: str = Field(min_length=1, max_length=120)
    forecast_day: int = Field(ge=30, le=180)
    radar_processing: Literal["calibrated_rtc_db"]
    observation_source: str = Field(min_length=10, max_length=2000)
    yield_source: str = Field(min_length=10, max_length=2000)
    protocol: str = Field(min_length=20, max_length=4000)
    historical: list[Season] = Field(min_length=40, max_length=2000)
    target: Target

    @model_validator(mode="after")
    def valid_study(self):
        keys = [(r.district.strip().casefold(), r.year) for r in self.historical]
        if len(keys) != len(set(keys)):
            raise ValueError("Only one row per district/year is allowed.")
        years = sorted({r.year for r in self.historical})
        if len(years) < 5:
            raise ValueError("Supply at least five complete historical seasons.")
        if any(sum(r.year == y for r in self.historical) < 5 for y in years):
            raise ValueError("Each year needs at least five district observations.")
        if max(years) >= self.target.year or self.target.year > date.today().year:
            raise ValueError("Target year must follow all historical years and cannot be a future year.")
        if self.target.district.strip().casefold() not in {k[0] for k in keys}:
            raise ValueError("Target district must have historical yield records.")
        return self


def matrix(rows):
    return np.array([[getattr(r, f) for f in FEATURES] for r in rows], dtype=float)


def fit_predict(train, targets):
    x, z = matrix(train), matrix(targets)
    center, scale = x.mean(0), x.std(0)
    scale[scale < 1e-8] = 1
    a = np.column_stack([np.ones(len(x)), (x-center)/scale])
    b = np.column_stack([np.ones(len(z)), (z-center)/scale])
    penalty = np.eye(a.shape[1]) * 10.0
    penalty[0, 0] = 0
    coef = np.linalg.solve(a.T @ a + penalty, a.T @ np.array([r.yield_t_ha for r in train]))
    return b @ coef


def baseline(train, district):
    own = [r.yield_t_ha for r in train if r.district.strip().casefold() == district.strip().casefold()]
    return float(np.mean(own or [r.yield_t_ha for r in train]))


def evaluate(study: CropStudy):
    rows = study.historical
    years = sorted({r.year for r in rows})
    folds, errors, baseline_errors, predictions = [], [], [], []
    # Expanding-year validation: training never sees the test year or later years.
    for year in years[3:]:
        train = [r for r in rows if r.year < year]
        test = [r for r in rows if r.year == year]
        pred = fit_predict(train, test)
        actual = np.array([r.yield_t_ha for r in test])
        err = np.abs(pred-actual)
        base_err = np.abs(np.array([baseline(train, r.district) for r in test])-actual)
        errors.extend(err.tolist())
        baseline_errors.extend(base_err.tolist())
        folds.append({"test_year": year, "train_through": year-1, "n_train": len(train), "n_test": len(test), "mae_t_ha": float(err.mean()), "baseline_mae_t_ha": float(base_err.mean())})
        predictions.extend({"district": r.district, "year": year, "actual_t_ha": r.yield_t_ha, "predicted_t_ha": float(p)} for r, p in zip(test, pred))
    mae, base_mae = float(np.mean(errors)), float(np.mean(baseline_errors))
    estimate = float(fit_predict(rows, [study.target])[0])
    x, target = matrix(rows), matrix([study.target])[0]
    outside = [FEATURES[i] for i in range(len(FEATURES)) if target[i] < x[:, i].min() or target[i] > x[:, i].max()]
    reasons = []
    if mae >= base_mae:
        reasons.append("The model did not beat the historical district-average baseline.")
    if outside:
        reasons.append("Target measurements fall outside training ranges: " + ", ".join(outside))
    if estimate <= 0:
        reasons.append("The model produced a nonphysical yield estimate.")
    # Holdout residual band is descriptive, not a calibrated confidence interval.
    spread = float(np.quantile(errors, 0.9))
    allowed = not reasons
    area = study.target.harvested_area_ha
    return {
        "status": "experimental_estimate" if allowed else "withheld",
        "crop": study.crop, "season": study.season, "region": study.region,
        "district": study.target.district, "year": study.target.year, "forecast_day": study.forecast_day,
        "model": "standardized-ridge-alpha10-v1", "features": FEATURES,
        "dataset_sha256": sha256(study.model_dump_json().encode()).hexdigest(),
        "mae_t_ha": mae, "baseline_mae_t_ha": base_mae,
        "rmse_t_ha": float(np.sqrt(np.mean(np.square(errors)))),
        "validation_folds": folds, "heldout_predictions": predictions,
        "historical_average_t_ha": baseline(rows, study.target.district),
        "yield_t_ha": estimate if allowed else None,
        "residual_band_t_ha": [max(0, estimate-spread), estimate+spread] if allowed else None,
        "production_t": estimate*area if allowed and area is not None else None,
        "withheld_reasons": reasons,
        "warnings": [
            "Experimental district estimate. Independent field validation is outstanding.",
            "The residual band uses the 90th percentile of held-out absolute errors; it is not a calibrated 90% prediction interval.",
            "Features and provenance are supplied by the uploader and cannot be independently verified by this endpoint.",
            "Use the same crop mask, radar calibration, orbit handling, growth windows and forecast cutoff for every year. No post-cutoff observations or future observed weather.",
            "District labels do not establish farm-level accuracy. Production assumes the supplied harvested area and excludes its uncertainty.",
        ],
        "provenance": {"observations": study.observation_source, "yields": study.yield_source, "protocol": study.protocol},
    }


@router.post("/evaluate")
def evaluate_crop(study: CropStudy):
    try:
        return evaluate(study)
    except np.linalg.LinAlgError as exc:
        raise HTTPException(422, "Dataset is numerically unsuitable for this model.") from exc
