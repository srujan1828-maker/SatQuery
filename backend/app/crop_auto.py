"""Automatic, bounded crop-context retrieval. Never infer yield from unlabelled pixels."""
from datetime import date, timedelta, datetime
from hashlib import sha256
from typing import Literal
import json
import os
import re
import time
import xml.etree.ElementTree as ET
import planetary_computer as pc
from collections import Counter
import httpx
import numpy as np
from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.models import Location, QueryRequest
from app.imagery import STAC, DATA_DIR, aoi_grid, read_asset

POWER = "https://power.larc.nasa.gov/api/temporal/daily/point"
VERSION = "crop-auto-context-v2"


class AutoCropRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["crop_auto"] = "crop_auto"
    location: Location
    crop: Literal["rice", "wheat", "maize"]
    sowing_date: date
    date: date
    radius_km: float = Field(default=1, ge=0.25, le=5, allow_inf_nan=False)
    history_years: int = Field(default=1, ge=0, le=2)
    state: str = Field(default="", max_length=100)
    district: str = Field(default="", max_length=100)
    season: str = Field(default="", max_length=60)

    @model_validator(mode="after")
    def valid_dates(self):
        if self.date > date.today() or self.sowing_date > self.date:
            raise ValueError("Choose past/current dates with sowing before the observation cutoff.")
        if not 30 <= (self.date-self.sowing_date).days <= 180:
            raise ValueError("Choose an observation cutoff 30–180 days after sowing.")
        if self.sowing_date.year-self.history_years < 2015 or abs(self.location.lat) > 80:
            raise ValueError("History must start in 2015 or later; latitude must be within ±80 degrees.")
        return self


def shift_year(day, years):
    try:
        return day.replace(year=day.year-years)
    except ValueError:
        return day.replace(year=day.year-years, day=28)


def get_json(url, params=None, payload=None):
    with httpx.Client(timeout=18, follow_redirects=False) as client:
        response = client.post(url, json=payload) if payload is not None else client.get(url, params=params)
        response.raise_for_status()
        return response.json()


def weather(lat, lon, start, end):
    cache = DATA_DIR / "crop-weather"
    cache.mkdir(exist_ok=True)
    key = sha256(f"{lat},{lon},{start},{end},v1".encode()).hexdigest()
    path = cache / f"{key}.json"
    if path.exists() and time.time()-path.stat().st_mtime < 86400:
        return json.loads(path.read_text())
    data = get_json(POWER, params={"parameters": "T2M,PRECTOTCORR", "community": "AG", "latitude": lat,
                                  "longitude": lon, "start": start.strftime("%Y%m%d"), "end": end.strftime("%Y%m%d"),
                                  "format": "JSON", "time-standard": "UTC"})
    params = data["properties"]["parameter"]
    days = [(start+timedelta(days=i)).strftime("%Y%m%d") for i in range((end-start).days+1)]
    def values(name, lower, upper):
        return [float(params[name][d]) for d in days if d in params[name] and params[name][d] is not None
                and lower <= float(params[name][d]) <= upper]
    rain, temp = values("PRECTOTCORR", 0, 2000), values("T2M", -90, 70)
    result = {"status": "complete" if len(rain) == len(temp) == len(days) else "partial",
            "expected_days": len(days), "rain_days": len(rain), "temperature_days": len(temp),
            "rain_mm": sum(rain) if len(rain) == len(days) else None,
            "available_rain_mm": sum(rain) if rain else None,
            "temperature_c": float(np.mean(temp)) if temp else None,
            "source": POWER, "scope": "Coarse gridded weather at the selected point; not a field weather station."}
    temp_path = path.with_suffix(f".{os.getpid()}.tmp")
    temp_path.write_text(json.dumps(result)); temp_path.replace(path)
    files = sorted(cache.glob("*.json"), key=lambda p: p.stat().st_mtime)
    for old in files[:-200]:
        old.unlink(missing_ok=True)
    return result


def catalog(bbox, start, end, collection):
    # Fixed catalog endpoint; no caller-supplied URLs. Deliberately bounded first page.
    body = {"collections": [collection], "bbox": bbox,
            "datetime": f"{start}T00:00:00Z/{end}T23:59:59Z", "limit": 100}
    data = get_json(f"{STAC}/search", payload=body)
    items = data.get("features", [])
    return items, any(link.get("rel") == "next" for link in data.get("links", []))


def select_scenes(items, start, end, radar=False, candidates_per_window=1):
    usable = []
    for item in items:
        try:
            acquired = datetime.fromisoformat(item["properties"]["datetime"].replace("Z", "+00:00")).date()
            if start <= acquired <= end:
                usable.append((acquired, item))
        except (KeyError, ValueError):
            continue
    if radar:
        usable = [(d, i) for d, i in usable if all(b in i.get("assets", {}) for b in ["vv", "vh"])
                  and i["properties"].get("sat:relative_orbit") is not None]
        if usable:
            track = Counter((i["properties"].get("sat:relative_orbit"), i["properties"].get("sat:orbit_state")) for _, i in usable).most_common(1)[0][0]
            usable = [(d, i) for d, i in usable if (i["properties"].get("sat:relative_orbit"), i["properties"].get("sat:orbit_state")) == track]
    midpoint = start + (end-start)//2
    selected = []
    for window, lo, hi in [("early", start, midpoint), ("late", midpoint+timedelta(days=1), end)]:
        candidates = [(d, i) for d, i in usable if lo <= d <= hi]
        if candidates:
            target = lo+(hi-lo)//2
            candidates.sort(key=lambda x: (0 if radar else x[1]["properties"].get("eo:cloud_cover", 100), abs((x[0]-target).days)))
            selected.extend((window, item) for _, item in candidates[:candidates_per_window])
    return selected


def parse_boa_metadata(content, baseline):
    root = ET.fromstring(content)
    values = {node.tag.split("}")[-1]: node.text for node in root.iter()}
    quant = float(values["BOA_QUANTIFICATION_VALUE"])
    if not np.isfinite(quant) or quant <= 0:
        raise ValueError("Invalid reflectance quantification")
    offsets = {node.attrib.get("band_id"): float(node.text) for node in root.iter()
               if node.tag.split("}")[-1] == "BOA_ADD_OFFSET"}
    result = {}
    for band, index in [("B04", "3"), ("B08", "7")]:
        if index not in offsets and float(baseline) >= 4:
            raise ValueError("Missing modern-baseline BOA offset")
        offset = offsets.get(index, 0.0)/quant
        if not np.isfinite(offset):
            raise ValueError("Invalid BOA offset")
        result[band] = {"scale": 1/quant, "offset": offset}
    return result


def reflectance_calibration(item):
    result = {band: item["assets"][band].get("raster:bands", [{}])[0] for band in ["B04", "B08"]}
    if all("scale" in meta and "offset" in meta for meta in result.values()):
        return result
    # PC items may omit raster:bands. Read the original product's BOA offsets
    # instead of guessing calibration from acquisition date.
    url = pc.sign(item["assets"]["product-metadata"]["href"])
    content = bytearray()
    with httpx.Client(timeout=18) as client:
        with client.stream("GET", url) as response:
            response.raise_for_status()
            for chunk in response.iter_bytes():
                content.extend(chunk)
                if len(content) > 2_000_000:
                    raise ValueError("Product metadata exceeds limit")
    return parse_boa_metadata(content, item["properties"]["s2:processing_baseline"])


def optical_values(item, transform, size):
    calibration = reflectance_calibration(item)
    red = read_asset(item, "B04", transform, size)
    nir = read_asset(item, "B08", transform, size)
    scl = read_asset(item, "SCL", transform, size, categorical=True)
    # Refuse to guess reflectance offsets across processing baselines.
    def reflectance(array, band):
        meta = calibration[band]
        if "scale" not in meta or "offset" not in meta:
            raise ValueError("Reflectance calibration metadata is missing")
        return array.astype(float)*float(meta["scale"])+float(meta["offset"])
    red, nir = reflectance(red, "B04"), reflectance(nir, "B08")
    denominator = red+nir
    valid = (~np.ma.getmaskarray(red) & ~np.ma.getmaskarray(nir) & ~np.ma.getmaskarray(scl)
             & (scl.filled(0) == 4) & np.isfinite(denominator.filled(np.nan)) & (denominator.filled(0) > 0))
    ndvi = ((nir-red)/np.ma.masked_where(denominator <= 0, denominator)).filled(np.nan)
    valid &= np.isfinite(ndvi) & (ndvi >= -1) & (ndvi <= 1)
    if valid.sum() < 20:
        raise ValueError("Too few clear vegetation pixels")
    return {"ndvi": float(np.median(ndvi[valid])), "usable_fraction": float(valid.mean()),
            "measurement": "Median NDVI over SCL vegetation pixels; not a crop-specific mask.", "reflectance_calibration": calibration}


def radar_values(item, transform, size):
    vv, vh = read_asset(item, "vv", transform, size), read_asset(item, "vh", transform, size)
    valid = (~np.ma.getmaskarray(vv) & ~np.ma.getmaskarray(vh) & np.isfinite(vv.filled(np.nan))
             & np.isfinite(vh.filled(np.nan)) & (vv.filled(0) > 0) & (vh.filled(0) > 0))
    if valid.sum() < 20:
        raise ValueError("Too few valid radar pixels")
    return {"vv_db": float(10*np.log10(np.median(vv.data[valid]))),
            "vh_db": float(10*np.log10(np.median(vh.data[valid]))), "usable_fraction": float(valid.mean()),
            "measurement": "10 log10 of median linear RTC gamma0 over the AOI; no crop mask."}


def satellite_series(request, start, end, radar, stop_at):
    collection = "sentinel-1-rtc" if radar else "sentinel-2-l2a"
    q = QueryRequest(query="crop context", location=request.location, date=end, radius_km=request.radius_km)
    bbox, size, transform = aoi_grid(q)
    # Regional screening grid only. Explicitly cap workload; no 10 m detail claim.
    size = min(size, 128)
    from rasterio.transform import from_bounds
    transform = from_bounds(*bbox, size, size)
    items, truncated = catalog(bbox, start, end, collection)
    selected = select_scenes(items, start, end, radar, candidates_per_window=3)
    observations, failed = [], 0
    for window, item in selected:
        if any(o["window"] == window for o in observations):
            continue
        if time.monotonic() > stop_at:
            failed += 1
            continue
        try:
            values = radar_values(item, transform, size) if radar else optical_values(item, transform, size)
            observations.append({"window": window, "date": item["properties"]["datetime"][:10], "scene_id": item["id"],
                "source": f"{STAC}/collections/{collection}/items/{item['id']}",
                "orbit": item["properties"].get("sat:relative_orbit"), "orbit_state": item["properties"].get("sat:orbit_state"), **values})
        except Exception:
            # Do not serialize upstream exception URLs: signed URLs can contain credentials.
            failed += 1
    return {"status": "complete" if len(observations) == 2 and not truncated else "partial" if observations else "unavailable",
            "collection": collection, "observations": observations, "candidate_count": len(items), "search_truncated": truncated,
            "failed_reads": failed, "sampling": "At most one successful scene per half-season, trying up to three candidates per window within the retrieval budget; grid no larger than 128x128.",
            "note": ("Public Sentinel-1 RTC observations retrieved." if observations else "Public RTC retrieval failed or had no coverage; check provider access and dates.") if radar else "Clouds or missing reflectance metadata can prevent NDVI extraction even after alternate-scene attempts."}


def norm(value):
    return " ".join(str(value).strip().casefold().split())


def yield_history(request):
    key, resource = os.getenv("OGD_API_KEY"), os.getenv("OGD_CROP_RESOURCE_ID", "")
    if not key or key.strip().lower() in {"your_key", "your_api_key", "your-key"}:
        return {"status": "not_configured", "records": [], "message": "Add your actual OGD_API_KEY to Render. Example placeholders such as your_key are not credentials. No user upload is required."}
    if not re.fullmatch(r"[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}", resource):
        return {"status": "resource_needed", "records": [], "message": "OGD key is configured, but a verified OGD_CROP_RESOURCE_ID is still needed. Choose a district/season/crop area-and-production resource from the official catalogue; an API key does not identify a dataset.",
                "source": "https://www.data.gov.in/catalog/district-wise-season-wise-crop-production-statistics-0"}
    if not all([request.state.strip(), request.district.strip(), request.season.strip()]):
        return {"status": "details_needed", "records": [], "message": "Add Indian state, district and season to match official crop records."}
    # Operator must verify this resource reports area in hectares and production in tonnes.
    if os.getenv("OGD_CROP_UNITS") != "hectares_tonnes":
        return {"status": "units_unverified", "records": [], "message": "The server's yield dataset units have not been verified."}
    mapping = json.loads(os.getenv("OGD_CROP_FIELDS", '{}'))
    fields = {k: mapping.get(k, k) for k in ["state_name", "district_name", "crop", "season", "crop_year", "area", "production"]}
    if any(not re.fullmatch(r"[a-zA-Z0-9_]+", x) for x in fields.values()):
        raise ValueError("Invalid provider field mapping")
    params = {"api-key": key, "format": "json", "limit": 100, "offset": 0}
    for k, value in [("state_name", request.state), ("district_name", request.district), ("crop", request.crop), ("season", request.season)]:
        params[f"filters[{fields[k]}]"] = value.strip()
    url = f"https://api.data.gov.in/resource/{resource}"
    try:
        data = get_json(url, params=params)
    except httpx.HTTPStatusError as error:
        code = error.response.status_code
        message = "OGD rejected the configured API key. Check it in Render." if code in (401, 403) else "OGD resource was not found. Check OGD_CROP_RESOURCE_ID." if code == 404 else "OGD is temporarily unavailable or rate limited. Retry later."
        return {"status": "unavailable", "records": [], "message": message}
    if not isinstance(data.get("records"), list):
        return {"status": "unavailable", "records": [], "message": "OGD returned no usable record list. Check the configured key and resource."}
    records = []
    for row in data.get("records", []):
        try:
            if any(norm(row[fields[k]]) != norm(v) for k, v in [("state_name", request.state), ("district_name", request.district), ("crop", request.crop), ("season", request.season)]):
                continue
            # Exact calendar-year keys only: do not silently interpret fiscal seasons.
            year = int(str(row[fields["crop_year"]]).strip())
            area, production = float(row[fields["area"]]), float(row[fields["production"]])
            if year >= request.sowing_date.year or area <= 0 or production < 0 or not np.isfinite([area, production]).all():
                continue
            records.append({"year": year, "area_ha": area, "production_t": production, "yield_t_ha": production/area})
        except (ValueError, KeyError, TypeError):
            continue
    counts = Counter(r["year"] for r in records)
    records = sorted([r for r in records if counts[r["year"]] == 1], key=lambda r: r["year"])
    return {"status": "available" if records else "unavailable", "records": records,
            "source": f"https://data.gov.in/resource/{resource}", "search_truncated": int(data.get("total", 0)) > 100,
            "message": "District crop statistics for context only; not matched training labels for this smaller AOI. Duplicate year records are excluded."}


def retrieve(request: AutoCropRequest):
    cache_dir = DATA_DIR / "crop-auto"
    cache_dir.mkdir(exist_ok=True)
    digest = sha256((VERSION+request.model_dump_json()+str(bool(os.getenv("PC_SDK_SUBSCRIPTION_KEY")))+str(bool(os.getenv("OGD_API_KEY")))+os.getenv("OGD_CROP_RESOURCE_ID", "")+os.getenv("OGD_CROP_UNITS", "")+os.getenv("OGD_CROP_FIELDS", "")).encode()).hexdigest()
    path = cache_dir/f"{digest}.json"
    if path.exists() and time.time()-path.stat().st_mtime < 86400:
        result = json.loads(path.read_text()); result["cached"] = True; return result
    # Bound cache retention independently of imagery artifacts.
    existing = sorted(cache_dir.glob("*.json"), key=lambda p: p.stat().st_mtime)
    for old in existing:
        if time.time()-old.stat().st_mtime > 86400 or len(existing) > 200:
            old.unlink(missing_ok=True)
            if len(existing) > 200: existing = existing[1:]
    stop_at = time.monotonic()+150
    result = {"kind": "crop_auto", "pipeline": VERSION, "request": request.model_dump(mode="json"), "cached": False,
              "retrieved_at": datetime.now().isoformat(), "seasons": [], "images": [],
              "forecast": {"status": "withheld", "yield_t_ha": None, "production_t": None,
                "reasons": ["No validated crop-specific model with matched yield labels is connected for this area.",
                            "Satellite summaries cover the selected AOI and are not masked to the selected crop."]},
              "warnings": ["Historical windows reuse the entered sowing month/day. Actual sowing dates may differ.",
                           "Two satellite snapshots per season are screening context, not a full growth curve or crop diagnosis.",
                           "Radar tracks can differ between years. Compare track IDs before interpreting changes.",
                           "Weather is gridded at the selected point, not a field measurement."]}
    def safe(fn):
        try: return fn()
        except Exception: return {"status": "unavailable", "message": "Source request failed or returned unsupported data. Retry later; no values were substituted."}
    result["yield_history"] = safe(lambda: yield_history(request))
    # Weather first, so it survives raster failures. Request only observed dates.
    for n in range(request.history_years+1):
        start, end = shift_year(request.sowing_date, n), shift_year(request.date, n)
        result["seasons"].append({"year": start.year, "start": str(start), "end": str(end),
                                  "weather": safe(lambda: weather(request.location.lat, request.location.lon, start, end))})
    for entry in result["seasons"]:
        for key, radar in [("optical", False), ("radar", True)]:
            entry[key] = safe(lambda: satellite_series(request, date.fromisoformat(entry["start"]), date.fromisoformat(entry["end"]), radar, stop_at)) if time.monotonic() < stop_at else {"status": "deferred", "message": "Retrieval budget reached. Retry with fewer historical seasons."}
    # Partial failures are not cached; avoid trapping a provider outage for a day.
    complete = all(s[k].get("status") == "complete" for s in result["seasons"] for k in ["weather", "optical", "radar"])
    result["status"] = "context_ready" if complete else "partial_context"
    if complete:
        temp = path.with_suffix(f".{os.getpid()}.tmp"); temp.write_text(json.dumps(result)); temp.replace(path)
    return result
