"""Optional optical display products; never substitute these for model RGB evidence."""
from hashlib import sha256
from io import BytesIO
import os
import numpy as np
from PIL import Image
from app.models import OpticalView
from app.imagery import ARTIFACTS, read_asset


def save_view(kind, label, rgb, valid, method, legend):
    rgba = np.dstack((np.uint8(np.clip(rgb, 0, 255)), valid.astype('uint8') * 255))
    out = BytesIO()
    Image.fromarray(rgba).save(out, format="PNG")
    content = out.getvalue()
    digest = sha256(content).hexdigest()
    path = ARTIFACTS / f"{digest}.png"
    if not path.exists():
        temp = path.with_suffix(f".{os.getpid()}.tmp")
        temp.write_bytes(content)
        temp.replace(path)
    return OpticalView(kind=kind, label=label, url=f"/media/artifacts/{digest}.png", sha256=digest, method=method, legend=legend)


def ndvi_values(red, nir):
    denominator = red + nir
    value = np.ma.divide(nir - red, np.ma.masked_where(denominator <= 0, denominator))
    mask = ~np.ma.getmaskarray(value) & np.isfinite(value.filled(np.nan)) & (value.filled(0) >= -1) & (value.filled(0) <= 1)
    return value.filled(0), mask


def build_views(item, transform, size, scl, valid):
    views, warnings = [], []
    classes = scl.filled(0)
    rgb = np.zeros((size, size, 3), dtype=np.uint8)
    for code, color in {4: (35, 170, 65), 5: (240, 210, 65), 6: (35, 110, 230), 7: (145, 145, 145)}.items():
        rgb[classes == code] = color
    views.append(save_view("scene_classes", "Scene classes", rgb, valid,
        "Sentinel-2 SCL at 20 m, nearest-neighbour resampled to display grid. Broad scene classes, not a detailed land-cover or crop map.",
        ["Green: vegetation", "Yellow: non-vegetated", "Blue: water", "Grey: unclassified", "Transparent: cloud/shadow/missing"]))
    try:
        from app.crop_auto import reflectance_calibration
        calibration = reflectance_calibration(item, ("B03", "B04", "B08"))
        red_raw = read_asset(item, "B04", transform, size)
        nir_raw = read_asset(item, "B08", transform, size)
        red = red_raw.astype(float) * calibration['B04']['scale'] + calibration['B04']['offset']
        nir = nir_raw.astype(float) * calibration['B08']['scale'] + calibration['B08']['offset']
        ndvi, usable = ndvi_values(red, nir)
        usable &= valid
        if usable.sum() < 20:
            raise ValueError("Insufficient calibrated pixels")
        # Fixed colour scale, identical between dates; no scene-specific stretching.
        stops = [-1, 0, .2, .5, 1]
        palette = np.array([[38, 70, 160], [210, 75, 55], [240, 210, 65], [125, 195, 55], [15, 95, 45]])
        colors = np.stack([np.interp(ndvi, stops, palette[:, c]) for c in range(3)], axis=-1)
        views.append(save_view("ndvi", "Vegetation index (NDVI)", colors, usable,
            "Calibrated (B08 − B04) / (B08 + B04), fixed −1 to 1 scale. No crop-specific mask; NDVI is not yield.",
            ["Blue: −1", "Red: 0", "Yellow: 0.2", "Light green: 0.5", "Dark green: 1", "Transparent: invalid"]))
        green = read_asset(item, "B03", transform, size)
        green = green.astype(float) * calibration['B03']['scale'] + calibration['B03']['offset']
        channels = np.ma.stack([nir, red, green])
        mask = valid & ~np.ma.getmaskarray(channels).any(axis=0) & np.isfinite(channels.filled(np.nan)).all(axis=0)
        display = np.moveaxis(np.clip(channels.filled(0), 0, .4) / .4 * 255, 0, -1)
        views.append(save_view("false_colour", "False colour (NIR / red / green)", display, mask,
            "Calibrated B08/B04/B03 reflectance with fixed 0–0.4 display stretch. Display only. Red tones often highlight vegetation, not a classification.",
            ["Red channel: near-infrared", "Green channel: red", "Blue channel: green", "Transparent: invalid"]))
    except Exception:
        warnings.append("Some spectral views could not be retrieved or calibrated. Natural colour and available scene classes remain usable; no synthetic replacement was generated.")
    return views, warnings
