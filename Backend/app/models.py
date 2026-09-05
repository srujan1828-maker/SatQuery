from __future__ import annotations

from datetime import date as Date
from typing import Literal

from pydantic import BaseModel, Field, model_validator

Mode = Literal["vqa", "change_detection", "fusion_demo"]
Confidence = Literal["high", "medium", "low", "uncertain"]


class Location(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    name: str | None = None


class DateRange(BaseModel):
    start: Date
    end: Date

    @model_validator(mode="after")
    def ordered(self) -> "DateRange":
        if self.end < self.start:
            raise ValueError("date_range.end must not be before date_range.start")
        return self


class QueryRequest(BaseModel):
    query: str = Field(min_length=1, max_length=4000)
    language: str | None = None
    location: Location | None = None
    # Use an alias so Pydantic does not resolve this type against this field's
    # name while evaluating postponed annotations during application startup.
    date: Date | None = None
    date_range: DateRange | None = None
    mode: Mode | None = None


class ImageResult(BaseModel):
    id: str
    url: str
    sensor: str
    date: Date
    role: Literal["single", "before", "after", "optical", "radar"]


class OverlayBox(BaseModel):
    image_id: str
    label: str
    x_min: float = Field(ge=0, le=1)
    y_min: float = Field(ge=0, le=1)
    x_max: float = Field(ge=0, le=1)
    y_max: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def ordered(self) -> "OverlayBox":
        if self.x_max < self.x_min or self.y_max < self.y_min:
            raise ValueError("overlay box maximum coordinates must follow minimum coordinates")
        return self


class APIError(BaseModel):
    code: str
    message: str


class QueryResponse(BaseModel):
    mode: Mode
    answer_text: str
    images: list[ImageResult]
    overlay_boxes: list[OverlayBox]
    change_summary: str | None
    confidence_flag: Confidence
    used_cache_fallback: bool
    error: APIError | None
