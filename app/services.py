from __future__ import annotations

import base64
import os
from dataclasses import dataclass
from datetime import date

import httpx
from dotenv import load_dotenv

from app.models import APIError, DateRange, ImageResult, Location, Mode, OverlayBox, QueryRequest, QueryResponse

load_dotenv()


@dataclass(frozen=True)
class Settings:
    geochat_url: str | None
    gemini_api_key: str | None
    demo_mode: bool

    @classmethod
    def from_environment(cls) -> "Settings":
        """Load optional local `.env` values without exposing them through the API."""
        return cls(
            geochat_url=os.getenv("GEOCHAT_ENDPOINT_URL") or None,
            gemini_api_key=os.getenv("GEMINI_API_KEY") or None,
            demo_mode=os.getenv("DEMO_MODE", "true").lower() == "true",
        )


def route_query(request: QueryRequest) -> Mode:
    """Small, predictable router used until the optional external router is connected."""
    if request.mode:
        return request.mode
    query = request.query.casefold()
    if any(term in query for term in ("fusion", "radar", "sar", "flood demo", "multisensor")):
        return "fusion_demo"
    if request.date_range or any(term in query for term in ("change", "compare", "before", "after", "difference")):
        return "change_detection"
    return "vqa"


def validation_error(mode: Mode, message: str) -> QueryResponse:
    return QueryResponse(mode=mode, answer_text=message, images=[], overlay_boxes=[], change_summary=None,
                         confidence_flag="uncertain", used_cache_fallback=False,
                         error=APIError(code="invalid_query", message=message))


def image(image_id: str, sensor: str, image_date: date, role: str) -> ImageResult:
    return ImageResult(id=image_id, url=f"/media/{image_id}.svg", sensor=sensor, date=image_date, role=role)  # type: ignore[arg-type]


async def geochat_answer(prompt: str, settings: Settings) -> tuple[str | None, bool]:
    """Call Contract A when configured; demo mode remains usable without credentials."""
    if not settings.geochat_url:
        return None, False
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            # A valid PNG placeholder keeps the Contract A multipart shape intact.
            placeholder = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLJywAAAABJRU5ErkJggg==")
            response = await client.post(
                f"{settings.geochat_url.rstrip('/')}/infer",
                data={"prompt": prompt, "task": "vqa"},
                files={"image": ("scene.png", placeholder, "image/png")},
            )
            response.raise_for_status()
            payload = response.json()
            return str(payload.get("answer") or ""), bool(payload.get("model_confident"))
    except (httpx.HTTPError, ValueError):
        return None, False


async def handle_query(request: QueryRequest, settings: Settings | None = None) -> QueryResponse:
    settings = settings or Settings.from_environment()
    mode = route_query(request)
    if mode == "fusion_demo":
        optical = image("fusion_optical", "sentinel-2", date(2024, 5, 12), "optical")
        radar = image("fusion_radar", "sentinel-1", date(2024, 5, 13), "radar")
        return QueryResponse(mode=mode, answer_text="The optical image shows inundated lowlands; the radar image corroborates smooth open-water extent through cloud cover.", images=[optical, radar], overlay_boxes=[], change_summary=None, confidence_flag="medium", used_cache_fallback=True, error=None)

    if request.location is None:
        return validation_error(mode, "A location is required for this satellite query.")
    if mode == "vqa" and request.date is None:
        return validation_error(mode, "A date is required for a single-image question.")
    if mode == "change_detection" and request.date_range is None:
        return validation_error(mode, "A date range is required for change detection.")

    if mode == "vqa":
        assert request.date
        single = image("vqa_scene", "sentinel-2", request.date, "single")
        answer, confident = await geochat_answer(request.query, settings)
        if answer:
            return QueryResponse(mode=mode, answer_text=answer, images=[single], overlay_boxes=[], change_summary=None, confidence_flag="high" if confident else "uncertain", used_cache_fallback=False, error=None)
        return QueryResponse(mode=mode, answer_text=f"Demo imagery for {request.location.name or 'the requested location'} shows a mixed land and water scene. Configure GEOCHAT_ENDPOINT_URL for a model-grounded answer.", images=[single], overlay_boxes=[OverlayBox(image_id=single.id, label="area of interest", x_min=.25, y_min=.28, x_max=.66, y_max=.68, confidence=.62)], change_summary=None, confidence_flag="medium", used_cache_fallback=False, error=None)

    assert request.date_range
    before = image("change_before", "sentinel-2", request.date_range.start, "before")
    after = image("change_after", "sentinel-2", request.date_range.end, "after")
    summary = "The highlighted low-lying area has expanded in surface-water coverage between the selected dates."
    return QueryResponse(mode=mode, answer_text=summary, images=[before, after], overlay_boxes=[OverlayBox(image_id=after.id, label="observed change", x_min=.34, y_min=.24, x_max=.75, y_max=.71, confidence=.71)], change_summary=summary, confidence_flag="medium", used_cache_fallback=False, error=None)
