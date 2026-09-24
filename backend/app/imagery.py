"""Bounded COG reads. Display and inference use the same immutable PNG bytes."""

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from hashlib import sha256
from io import BytesIO
from math import ceil, cos, radians
from pathlib import Path
import os
import json
import time
import uuid
import logging
import requests
from dotenv import load_dotenv
import httpx
import numpy as np
import planetary_computer as pc
import rasterio
from rasterio.enums import Resampling
from rasterio.vrt import WarpedVRT
from rasterio.transform import from_bounds
from rasterio.features import shapes
from pyproj import Geod
from PIL import Image
from app.models import ImageResult, QueryRequest

load_dotenv()
logger = logging.getLogger(__name__)

STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
DATA_DIR = Path(os.getenv("SATQUERY_DATA_DIR", "/tmp/satquery"))
ARTIFACTS = DATA_DIR / "artifacts"
ARTIFACTS.mkdir(parents=True, exist_ok=True)


class EvidenceUnavailable(Exception):
    pass


@dataclass
class Observation:
    image: ImageResult
    content: bytes
    valid: np.ndarray
    water: np.ndarray | None
    transform: object


def aoi_grid(request):
    lat, lon = request.location.lat, request.location.lon
    dy = request.radius_km / 111.32
    dx = dy / cos(radians(lat))
    bbox = [lon - dx, lat - dy, lon + dx, lat + dy]
    if bbox[0] < -180 or bbox[2] > 180:
        raise EvidenceUnavailable(
            "Areas crossing the dateline are not yet supported. Move or reduce the area."
        )
    # About 10 m per pixel; never enlarge a tiny crop to a fixed output size.
    size = min(1024, ceil(request.radius_km * 200))
    return bbox, size, from_bounds(*bbox, size, size)


def catalog_candidates(request, target, collection):
    bbox, _, _ = aoi_grid(request)
    start = target - timedelta(days=request.tolerance_days)
    end = min(date.today(), target + timedelta(days=request.tolerance_days))
    payload = {
        "collections": [collection],
        "bbox": bbox,
        "datetime": f"{start}T00:00:00Z/{end}T23:59:59Z",
        "limit": 100,
    }
    with httpx.Client(timeout=20) as client:
        response = client.post(f"{STAC}/search", json=payload)
        response.raise_for_status()
        features = response.json().get("features", [])

    def rank(item):
        d = datetime.fromisoformat(
            item["properties"]["datetime"].replace("Z", "+00:00")
        ).date()
        return item["properties"].get("eo:cloud_cover", 100), abs((d - target).days)

    return sorted(features, key=rank)


def read_asset(item, name, transform, size, indexes=1, categorical=False):
    asset = item.get("assets", {}).get(name)
    if not asset:
        raise EvidenceUnavailable(f"This scene has no {name} asset.")
    # Only catalog-owned asset URLs enter this pipeline; no caller-supplied URL.
    href = pc.sign(asset["href"])
    with rasterio.Env(
        GDAL_HTTP_TIMEOUT="15",
        GDAL_HTTP_MAX_RETRY="1",
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
    ):
        with rasterio.open(href) as src:
            with WarpedVRT(
                src,
                crs="EPSG:4326",
                transform=transform,
                width=size,
                height=size,
                resampling=Resampling.nearest if categorical else Resampling.bilinear,
            ) as vrt:
                return vrt.read(indexes, masked=True)


def _fetch_observation(request: QueryRequest, target: date, role: str, radar=False):
    collection = "sentinel-1-grd" if radar else "sentinel-2-l2a"
    bbox, size, transform = aoi_grid(request)
    failures = 0
    rejected = 0
    checked = 0
    best_fraction = 0.0
    started = time.monotonic()
    try:
        candidates = catalog_candidates(request, target, collection)
    except (httpx.HTTPError, ValueError, KeyError) as error:
        raise EvidenceUnavailable(
            "The source catalog is temporarily unavailable. Please retry."
        ) from error
    # Round-robin acquisition days so overlapping tiles from one date cannot
    # consume the entire search budget. Rank cloud cover within the allowed window.
    days = {}
    for candidate in candidates:
        day = candidate.get("properties", {}).get("datetime", "")[:10]
        days.setdefault(day, []).append(candidate)
    diverse = []
    while days and len(diverse) < 10:
        for day in list(days):
            diverse.append(days[day].pop(0))
            if not days[day]:
                del days[day]
            if len(diverse) == 10:
                break
    for item in diverse:
        if time.monotonic() - started > 90:
            break
        checked += 1
        try:
            water = None
            if radar:
                vv = read_asset(item, "vv", transform, size)
                valid = (
                    ~np.ma.getmaskarray(vv)
                    & np.isfinite(vv.astype(float).filled(np.nan))
                    & (vv.filled(0) > 0)
                )
                # Display only: no flood threshold claimed for uncalibrated source values.
                values = np.log1p(np.maximum(vv.filled(0), 0))
                if not valid.any():
                    rejected += 1
                    continue
                low, high = np.percentile(values[valid], [2, 98])
                gray = np.uint8(
                    np.clip((values - low) / max(high - low, 1e-6), 0, 1) * 255
                )
                rgb = np.repeat(gray[:, :, None], 3, axis=2)
                method = "VV log display, scene-specific 2–98% stretch; not a calibrated measurement"
                resolution = 10.0
            else:
                visual = read_asset(item, "visual", transform, size, [1, 2, 3])
                scl = read_asset(item, "SCL", transform, size, categorical=True)
                valid = (
                    ~np.ma.getmaskarray(visual).any(axis=0)
                    & ~np.ma.getmaskarray(scl)
                    & np.isin(scl.filled(0), [4, 5, 6, 7])
                )
                water = (scl.filled(0) == 6) & valid
                rgb = np.moveaxis(np.uint8(np.clip(visual.filled(0), 0, 255)), 0, -1)
                method = "Source visual RGB; transparent cloud/shadow/no-data mask from 20 m SCL"
                resolution = 10.0
            fraction = float(valid.mean())
            best_fraction = max(best_fraction, fraction)
            if fraction < 0.5:
                rejected += 1
                continue
            rgba = np.dstack((rgb, valid.astype("uint8") * 255))
            buf = BytesIO()
            Image.fromarray(rgba).save(buf, format="PNG")
            content = buf.getvalue()
            digest = sha256(content).hexdigest()
            path = ARTIFACTS / f"{digest}.png"
            if not path.exists():
                temp = ARTIFACTS / f"{digest}.{os.getpid()}.tmp"
                temp.write_bytes(content)
                temp.replace(path)
            acquired = datetime.fromisoformat(
                item["properties"]["datetime"].replace("Z", "+00:00")
            ).date()
            meta = ImageResult(
                id=f"{role}_{digest[:12]}",
                url=f"/media/artifacts/{digest}.png",
                sensor="sentinel-1" if radar else "sentinel-2",
                date=acquired,
                role=role,
                scene_id=item["id"],
                collection=collection,
                source_url=f"{STAC}/collections/{collection}/items/{item['id']}",
                requested_date=target,
                date_offset_days=(acquired - target).days,
                bbox=bbox,
                width=size,
                height=size,
                resolution_m=resolution,
                sha256=digest,
                usable_fraction=fraction,
                render_method=method,
            )
            if not radar and request.optical_views:
                from app.optical_views import build_views
                meta.views, meta.view_warnings = build_views(item, transform, size, scl, valid)
            return Observation(meta, content, valid, water, transform)
        except (
            httpx.HTTPError,
            requests.RequestException,
            rasterio.errors.RasterioError,
            KeyError,
            ValueError,
            EvidenceUnavailable,
        ) as error:
            logger.warning("Source raster unavailable (%s)", type(error).__name__)
            failures += 1
    if not candidates:
        reason = "The catalogue returned no scenes intersecting this area in the requested date window."
    else:
        reason = (f"Checked {checked} of {len(candidates)} catalogue candidates: "
                  f"{rejected} had less than 50% usable coverage; {failures} could not be read. "
                  f"Best usable coverage was {best_fraction:.0%}. "
                  "Usable coverage excludes cloud, shadow and missing pixels.")
    suggestion = "Try a wider date tolerance (up to ±30 days), a different date, or a smaller area."
    raise EvidenceUnavailable(f"No usable {collection} observation within ±{request.tolerance_days} days of {target}. {reason} {suggestion}")


def water_change(before, after):
    if (
        before.image.scene_id == after.image.scene_id
        or before.image.date >= after.image.date
    ):
        raise EvidenceUnavailable(
            "Selected observations are identical or not chronologically ordered. Choose dates farther apart."
        )
    if (
        before.image.bbox != after.image.bbox
        or before.valid.shape != after.valid.shape
        or before.transform != after.transform
    ):
        raise EvidenceUnavailable("Observations must share the same geographic grid.")
    valid = before.valid & after.valid
    if valid.mean() < 0.5:
        raise EvidenceUnavailable(
            "Less than 50% of the area has usable evidence on both dates."
        )
    gained = valid & ~before.water & after.water
    lost = valid & before.water & ~after.water
    geod = Geod(ellps="WGS84")
    t = after.transform
    row_areas = []
    for row in range(valid.shape[0]):
        x0, y0 = t * (0, row)
        x1, y1 = t * (1, row + 1)
        area, _ = geod.polygon_area_perimeter([x0, x1, x1, x0], [y0, y0, y1, y1])
        row_areas.append(abs(area))
    areas = np.asarray(row_areas)[:, None]
    hectares = lambda mask: round(float((mask * areas).sum()) / 10000, 3)
    classes = np.where(gained, 1, np.where(lost, 2, 0)).astype("uint8")
    features = []
    truncated = False
    for geom, value in shapes(classes, mask=classes > 0, transform=t):
        if len(features) >= 1000:
            truncated = True
            break
        features.append(
            {
                "type": "Feature",
                "geometry": geom,
                "properties": {"change": "water_gain" if value == 1 else "water_loss"},
            }
        )
    metrics = {
        "method": "Sentinel-2 SCL class 6 transition (experimental screening)",
        "classification_resolution_m": 20,
        "valid_overlap_fraction": float(valid.mean()),
        "water_gain_ha": hectares(gained),
        "water_loss_ha": hectares(lost),
        "valid_area_ha": hectares(valid),
        "polygon_export_truncated": truncated,
        "validation_status": "Not independently validated; not a flood warning or a flood attribution.",
    }
    return metrics, {"type": "FeatureCollection", "features": features}


def prune_artifacts():
    """Seven-day / 1 GiB bounded single-host evidence retention."""
    files = sorted(
        (p for p in ARTIFACTS.iterdir() if p.suffix in (".png", ".npz")),
        key=lambda p: p.stat().st_mtime,
    )
    total = sum(p.stat().st_size for p in files)
    for path in files:
        try:
            stat = path.stat()
            if stat.st_mtime < time.time() - 7 * 86400 or total > 1024**3:
                path.unlink(missing_ok=True)
                total -= stat.st_size
        except FileNotFoundError:
            pass


def fetch_observation(request: QueryRequest, target: date, role: str, radar=False):
    key = sha256(
        json.dumps(
            {
                "version": "aoi-views-v2",
                "optical_views": request.optical_views,
                "lat": request.location.lat,
                "lon": request.location.lon,
                "radius": request.radius_km,
                "tolerance": request.tolerance_days,
                "target": str(target),
                "radar": radar,
            },
            sort_keys=True,
        ).encode()
    ).hexdigest()
    cached = ARTIFACTS / f"cache-{key}.npz"
    if cached.exists() and cached.stat().st_mtime > time.time() - 86400:
        try:
            with np.load(cached, allow_pickle=False) as data:
                meta = ImageResult.model_validate_json(str(data["metadata"]))
                meta = meta.model_copy(
                    update={"role": role, "id": f"{role}_{meta.sha256[:12]}"}
                )
                if any(not (ARTIFACTS / f"{view.sha256}.png").exists() for view in meta.views):
                    raise ValueError("Cached optical view expired")
                content = (ARTIFACTS / f"{meta.sha256}.png").read_bytes()
                if sha256(content).hexdigest() != meta.sha256:
                    raise ValueError("Invalid cached artifact")
                _, _, transform = aoi_grid(request)
                return Observation(
                    meta,
                    content,
                    data["valid"].copy(),
                    None if radar else data["water"].copy(),
                    transform,
                )
        except (OSError, ValueError, KeyError):
            pass
    result = _fetch_observation(request, target, role, radar)
    temp = ARTIFACTS / f"cache-{key}-{uuid.uuid4().hex}.tmp"
    with temp.open("wb") as handle:
        np.savez_compressed(
            handle,
            metadata=result.image.model_dump_json(),
            valid=result.valid,
            water=result.water if result.water is not None else np.zeros((0, 0), bool),
        )
    temp.replace(cached)
    return result
