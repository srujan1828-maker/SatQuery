# SatQuery — evidence-first Earth observation

React/Vite + FastAPI + Planetary Computer COG reads + CesiumJS. Select an area, inspect dated Sentinel observations, run experimental water-class change screening, and export traceable results.

## Implemented

- Bounded point/radius AOIs (0.25–5 km radius) read from source rasters onto one geographic grid.
- Date tolerance is explicit (0–30 days). No arbitrary-date or generated-image fallback.
- Cloud/shadow/no-data masking using Sentinel-2 SCL; minimum 50% usable AOI coverage.
- Same SHA-256-addressed PNG bytes used for inference and display; acquisition, scene, bounds and quality metadata accompany each image.
- Fit/actual-pixel/fullscreen viewer, shared before/after pan/zoom and display controls. Fit mode never enlarges a small raster. Enlarging does not add observed detail.
- Experimental SCL class-6 water transitions with geodesic area summaries and GeoJSON. These are **not independently validated flood detections**. SCL is 20 m classification resampled onto the display grid; RGB is 10 m sampling.
- GeoChat for single-image questions; Gemini for supported single/paired inputs. Model answers are uncalibrated, and no detection boxes are invented.
- Isolated cancellable jobs, deadlines, concurrency/IP budgets and restart-safe job records. Browser-saved runs and Markdown/JSON/GeoJSON exports.
- Optional lazy-loaded Cesium globe with AOI, acquisition selection, imagery opacity and change polygons. Terrain is optional and requires an ion token.
- Opt-in MediaPipe worker-based gesture experiment: one pinch rotates, two pinches zoom, release stops, Escape disables. Video remains local. Model assets load from Google's versioned URL unless self-hosted.

## Run locally

Requires Python 3.12 and Node 22+.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install '.[test]'
cp .env.example .env
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In another terminal:

```bash
cd frontend
npm ci
cp .env.example .env
npm run dev
```

Set `GEMINI_API_KEY` for paired image explanations and/or `GEOCHAT_ENDPOINT_URL` for single-image explanations. Without a provider, verified observations and experimental deterministic screening remain available as partial results. Missing upstream data never becomes a synthetic result.

## Tests

```bash
cd backend
python -m pytest -q
cd ../frontend
npm run lint
npm test
npm run build
```

Backend tests use controlled local rasters for masking, coordinate and provenance checks plus API lifecycle/failure tests. Frontend tests verify scaling, shared comparison transforms, stale-result rejection, coordinate zero, contract handling and gesture stop behavior. These tests do not validate scientific accuracy or physical-webcam usability.

## Deployment and limitations

See [deployment](docs/DEPLOYMENT.md), [validation](docs/VALIDATION.md) and [remaining roadmap](docs/ROADMAP.md). Deploy backend and frontend together: the old synchronous `/api/query` now returns 410; use `/api/jobs`.

Current limits: one API worker on one host; no account/RBAC system; job IDs are unguessable bearer capabilities; saved runs are browser-local; no arbitrary polygon AOI; no purchased high-resolution imagery; no calibrated optical/SAR fusion. Do not use for sensitive AOIs or emergency decisions without completing the corresponding security and scientific validation work.

Evidence artifacts expire after seven days or under the 1 GiB cache cap. Export original PNGs and reports for archival use. Navigation basemaps have different acquisition/resolution characteristics and are not analysis evidence.
