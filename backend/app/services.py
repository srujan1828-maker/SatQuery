from __future__ import annotations

import asyncio
import logging
import os
import re
from dataclasses import dataclass
from urllib.parse import quote

import httpx
from dotenv import load_dotenv

from app.models import Location

load_dotenv()
logger = logging.getLogger(__name__)

DEFAULT_GEOCHAT_TIMEOUT_SECONDS = 90.0
DEFAULT_GEOCHAT_ATTEMPTS = 2
SENTINEL_STAC_SEARCH_URL = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
SENTINEL_TILE_URL = (
    "https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad"
)


@dataclass(frozen=True)
class Settings:
    geochat_url: str | None
    geochat_timeout_seconds: float
    geochat_attempts: int
    gemini_api_key: str | None
    frontend_origins: tuple[str, ...]
    demo_mode: bool

    @classmethod
    def from_environment(cls) -> "Settings":
        """Load optional local `.env` values without exposing them through the API."""
        frontend_origins = tuple(
            origin.strip().rstrip("/")
            for origin in os.getenv("FRONTEND_URL", "").split(",")
            if origin.strip()
        )
        return cls(
            geochat_url=os.getenv("GEOCHAT_ENDPOINT_URL") or None,
            geochat_timeout_seconds=positive_float_environment(
                "GEOCHAT_TIMEOUT_SECONDS", DEFAULT_GEOCHAT_TIMEOUT_SECONDS
            ),
            geochat_attempts=positive_int_environment(
                "GEOCHAT_ATTEMPTS", DEFAULT_GEOCHAT_ATTEMPTS
            ),
            gemini_api_key=os.getenv("GEMINI_API_KEY") or None,
            frontend_origins=frontend_origins,
            demo_mode=os.getenv("DEMO_MODE", "false").lower() == "true",
        )


def positive_float_environment(name: str, default: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except ValueError:
        return default
    return value if value > 0 else default


def positive_int_environment(name: str, default: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        return default
    return value if value > 0 else default


def geochat_infer_url(base_or_infer_url: str) -> str:
    """Accept either a tunnel base URL or the complete Contract A `/infer` URL."""
    normalized = base_or_infer_url.rstrip("/")
    return normalized if normalized.endswith("/infer") else f"{normalized}/infer"


async def gemini_answer(
    prompt: str,
    image_data: bytes,
    gemini_api_key: str,
    image_content_type: str = "image/png",
    location: Location | None = None,
    task: str = "vqa",
    comparison_image_data: bytes | None = None,
    comparison_content_type: str = "image/png",
    primary_label: str = "Satellite Scene",
    comparison_label: str = "Comparison Scene",
) -> tuple[str | None, list[dict], bool]:
    """Call Google Gemini 1.5 Flash Vision for cloud AI multimodal satellite analysis."""
    import base64

    b64_image = base64.b64encode(image_data).decode("utf-8")
    system_prompt = (
        "You are an expert Earth Observation and Satellite Remote Sensing Vision-Language Assistant "
        "named SatQuery for Smart India Hackathon. Analyze the provided Sentinel satellite imagery. "
        "Answer the user query thoroughly and professionally based on the real image evidence, "
        "highlighting geographical features, water bodies, urban areas, vegetation, or infrastructure. "
        "Keep your response concise, factual, and informative (2-4 sentences)."
    )
    loc_context = (
        f" Location: {location.name or 'Target area'} (lat: {location.lat:.4f}, lon: {location.lon:.4f})."
        if location
        else ""
    )
    user_text = f"{system_prompt}\n\nTask: {task}.{loc_context}\n\nQuestion: {prompt}"

    parts: list[dict] = []
    if comparison_image_data is not None:
        b64_comp = base64.b64encode(comparison_image_data).decode("utf-8")
        parts.append({"text": f"{user_text}\n\n[Primary Observation: {primary_label}]"})
        parts.append(
            {"inline_data": {"mime_type": image_content_type, "data": b64_image}}
        )
        parts.append(
            {"text": f"\n[Secondary Observation / Baseline: {comparison_label}]"}
        )
        parts.append(
            {"inline_data": {"mime_type": comparison_content_type, "data": b64_comp}}
        )
    else:
        parts.append({"text": user_text})
        parts.append(
            {"inline_data": {"mime_type": image_content_type, "data": b64_image}}
        )

    primary_model = os.getenv("GEMINI_MODEL") or "gemini-flash-latest"
    models_to_try = [primary_model]
    for m in ():
        if m not in models_to_try:
            models_to_try.append(m)

    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 1000,
        },
    }
    for model_name in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_api_key}"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        p = candidates[0].get("content", {}).get("parts", [])
                        if p:
                            text = p[0].get("text", "").strip()
                            if text:
                                return text, [], False
                else:
                    logger.warning(
                        "Gemini Vision model %s returned status %d: %s",
                        model_name,
                        resp.status_code,
                        resp.text[:200],
                    )
        except Exception as error:
            logger.warning(
                "Gemini Vision model %s call failed (%s)",
                model_name,
                type(error).__name__,
            )
    return None, [], False


async def geochat_answer(
    prompt: str,
    settings: Settings,
    image_data: bytes | None = None,
    image_content_type: str = "image/png",
    task: str = "vqa",
) -> tuple[str | None, list[dict], bool, str | None]:
    """Call Contract A with enough time and retries for cold-started inference."""
    if not settings.geochat_url:
        return None, [], False, None
    timeout = httpx.Timeout(settings.geochat_timeout_seconds, connect=10.0)
    if image_data is None:
        return None, [], False, "No verified image was supplied."
    model_image = image_data
    async with httpx.AsyncClient(timeout=timeout) as client:
        for attempt in range(1, settings.geochat_attempts + 1):
            try:
                response = await client.post(
                    geochat_infer_url(settings.geochat_url),
                    data={"prompt": prompt, "task": task},
                    files={"image": ("scene", model_image, image_content_type)},
                )
                response.raise_for_status()
                payload = response.json()
                raw_boxes = payload.get("boxes", [])
                boxes = raw_boxes if isinstance(raw_boxes, list) else []
                return (
                    str(payload.get("answer") or ""),
                    boxes,
                    bool(payload.get("model_confident")),
                    None,
                )
            except ValueError:
                logger.warning("GeoChat returned an invalid response; not retrying.")
                break
            except httpx.HTTPStatusError as error:
                if 400 <= error.response.status_code < 500:
                    logger.warning(
                        "GeoChat rejected the inference request with HTTP %s.",
                        error.response.status_code,
                    )
                    break
                response_detail = error.response.text.strip().replace("\n", " ")[:500]
                logger.warning(
                    "GeoChat returned HTTP %s on attempt %s/%s: %s",
                    error.response.status_code,
                    attempt,
                    settings.geochat_attempts,
                    response_detail or "no response body",
                )
            except httpx.HTTPError as error:
                logger.warning(
                    "GeoChat request failed on attempt %s/%s: %s",
                    attempt,
                    settings.geochat_attempts,
                    error,
                )

            if attempt < settings.geochat_attempts:
                await asyncio.sleep(0.5)
    return None, [], False, "The imagery model is temporarily unavailable."


POPULAR_LOCATIONS: list[dict] = [
    {
        "name": "New Delhi",
        "display_name": "New Delhi, Delhi, India",
        "lat": 28.6139,
        "lon": 77.2090,
        "category": "Capital Urban Core & Yamuna River",
    },
    {
        "name": "Kedarnath",
        "display_name": "Kedarnath, Rudraprayag, Uttarakhand, India",
        "lat": 30.7346,
        "lon": 79.0669,
        "category": "Himalayan Glacial & Flash Flood Risk",
    },
    {
        "name": "Mumbai Port",
        "display_name": "Mumbai, Maharashtra, India",
        "lat": 18.9667,
        "lon": 72.8258,
        "category": "Arabian Sea Coastal Development",
    },
    {
        "name": "Bangalore",
        "display_name": "Bengaluru, Karnataka, India",
        "lat": 12.9716,
        "lon": 77.5946,
        "category": "Silicon Valley Urban Sprawl",
    },
    {
        "name": "Brahmaputra River",
        "display_name": "Guwahati, Assam, India",
        "lat": 26.1856,
        "lon": 91.7539,
        "category": "Monsoon Inundation & SAR Radar",
    },
    {
        "name": "Chilika Lake",
        "display_name": "Chilika Lake, Odisha, India",
        "lat": 19.7165,
        "lon": 85.3214,
        "category": "Coastal Lagoon & Wetland Ecology",
    },
    {
        "name": "Suez Canal",
        "display_name": "Suez Canal, Ismailia Governorate, Egypt",
        "lat": 30.5852,
        "lon": 32.5658,
        "category": "Maritime Navigation Chokepoint",
    },
    {
        "name": "London",
        "display_name": "London, Greater London, England, United Kingdom",
        "lat": 51.5074,
        "lon": -0.1278,
        "category": "Temperate Urban & River Thames",
    },
    {
        "name": "Tokyo",
        "display_name": "Tokyo, Japan",
        "lat": 35.6762,
        "lon": 139.6503,
        "category": "Tokyo Bay Coastal Megacity",
    },
]


async def geocode_search(query: str) -> list[dict]:
    """Search and autocomplete locations for interactive geospatial map with instant fallback."""
    q = query.strip()
    if not q:
        return POPULAR_LOCATIONS[:6]

    # 1. Match local preset locations
    q_lower = q.lower()
    preset_matches = [
        loc
        for loc in POPULAR_LOCATIONS
        if q_lower in loc["name"].lower() or q_lower in loc["display_name"].lower()
    ]

    # 2. Check coordinates pattern: "lat, lon"
    coord_match = re.match(r"^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$", q)
    if coord_match:
        lat = float(coord_match.group(1))
        lon = float(coord_match.group(2))
        if -90 <= lat <= 90 and -180 <= lon <= 180:
            return [
                {
                    "name": f"Coordinate ({lat:.4f}, {lon:.4f})",
                    "display_name": f"Latitude: {lat:.4f}, Longitude: {lon:.4f}",
                    "lat": round(lat, 4),
                    "lon": round(lon, 4),
                    "category": "Direct Coordinate Target",
                }
            ]

    # 3. Query OpenStreetMap Nominatim for global real-time suggestions
    external_matches: list[dict] = []
    try:
        url = f"https://nominatim.openstreetmap.org/search?format=json&q={quote(q)}&limit=6&addressdetails=1"
        headers = {"User-Agent": "SatQuery-Geospatial/1.0", "Accept-Language": "en"}
        async with httpx.AsyncClient(timeout=3.5) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                for item in data:
                    lat = float(item.get("lat", 0))
                    lon = float(item.get("lon", 0))
                    display_name = item.get("display_name", "")
                    name = item.get("name") or display_name.split(",")[0]
                    cat = item.get("type", "location").replace("_", " ").title()
                    external_matches.append(
                        {
                            "name": name,
                            "display_name": display_name,
                            "lat": round(lat, 4),
                            "lon": round(lon, 4),
                            "category": cat,
                        }
                    )
    except Exception as err:
        logger.debug("Geocoding lookup notice: %s", err)

    # Merge and deduplicate
    combined: list[dict] = []
    seen = set()
    for item in preset_matches + external_matches:
        coord_key = (round(item["lat"], 2), round(item["lon"], 2))
        if coord_key not in seen:
            seen.add(coord_key)
            combined.append(item)
    return combined[:6]
