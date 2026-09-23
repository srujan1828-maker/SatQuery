from __future__ import annotations
from datetime import date as Date
from typing import Literal
from pydantic import BaseModel, Field, model_validator

Mode = Literal["vqa", "change_detection", "fusion", "fusion_demo"]
Confidence = Literal["high", "medium", "low", "uncertain"]


class Location(BaseModel):
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lon: float = Field(ge=-180, le=180, allow_inf_nan=False)
    name: str | None = Field(default=None, max_length=200)


class DateRange(BaseModel):
    start: Date
    end: Date

    @model_validator(mode="after")
    def ordered(self):
        if self.end <= self.start:
            raise ValueError("The after date must be later than the before date.")
        return self


class QueryRequest(BaseModel):
    query: str = Field(min_length=1, max_length=4000)
    language: Literal["en", "hi"] = "en"
    location: Location
    date: Date | None = None
    date_range: DateRange | None = None
    mode: Mode = "vqa"
    radius_km: float = Field(default=2.5, ge=0.25, le=5, allow_inf_nan=False)
    tolerance_days: int = Field(default=10, ge=0, le=30)

    @model_validator(mode="after")
    def valid(self):
        if not self.query.strip():
            raise ValueError("Enter a question.")
        if abs(self.location.lat) > 80:
            raise ValueError(
                "This imagery workflow currently supports latitudes between -80 and 80."
            )
        dates = (
            [self.date]
            if self.mode != "change_detection"
            else (
                [self.date_range.start, self.date_range.end] if self.date_range else []
            )
        )
        if not dates or any(d is None for d in dates):
            raise ValueError("Select the required observation date(s).")
        if any(d > Date.today() for d in dates):
            raise ValueError("Future observations are unavailable.")
        return self


class ImageResult(BaseModel):
    id: str
    url: str
    sensor: str
    date: Date
    role: Literal["single", "before", "after", "optical", "radar"]
    scene_id: str
    collection: str
    source_url: str
    requested_date: Date
    date_offset_days: int
    bbox: list[float]
    crs: str = "EPSG:4326"
    width: int
    height: int
    resolution_m: float
    sha256: str
    usable_fraction: float
    render_method: str


class OverlayBox(BaseModel):
    image_id: str
    label: str
    x_min: float = Field(ge=0, le=1)
    y_min: float = Field(ge=0, le=1)
    x_max: float = Field(ge=0, le=1)
    y_max: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def ordered(self):
        if self.x_max <= self.x_min or self.y_max <= self.y_min:
            raise ValueError("Invalid box bounds")
        return self


class APIError(BaseModel):
    code: str
    message: str


class QueryResponse(BaseModel):
    mode: Mode
    answer_text: str
    images: list[ImageResult] = Field(default_factory=list)
    overlay_boxes: list[OverlayBox] = Field(default_factory=list)
    change_summary: str | None = None
    confidence_flag: Confidence = "uncertain"
    used_cache_fallback: bool = False
    error: APIError | None = None
    analysis_status: Literal["complete", "partial", "unavailable"] = "unavailable"
    warnings: list[str] = Field(default_factory=list)
    metrics: dict | None = None
    change_geojson: dict | None = None
    request: QueryRequest | None = None
    pipeline_version: str = "aoi-scl-screening-v1"
    model_provider: str | None = None
