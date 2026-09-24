# Deployment

1. Deploy `backend/Dockerfile` with root directory `backend`.
2. Run one uvicorn worker (the Dockerfile already does this). Multi-worker replicas require an external job queue, shared object store and shared geocoder budget before scaling.
3. Set `FRONTEND_URL` to the exact production frontend origin(s). Defaults only allow localhost. Configure optional model credentials in the hosting secret store.
4. Mount persistent storage and set `SATQUERY_DATA_DIR` to it. Without storage, restarts lose images and job records. SQLite records survive restarts on a persistent volume; interrupted jobs become failed and require retry.
5. Set `MAX_ACTIVE_JOBS` based on memory and `ANALYSIS_TIMEOUT_SECONDS` (default 240). Each analysis runs in its own process and can be terminated, including blocking GDAL reads.
6. Set frontend `VITE_API_BASE_URL` at build time, then deploy from the root Vercel configuration. `npm ci` uses the committed lockfile. Cesium assets and MediaPipe WASM are copied into public build output.
7. Optional `VITE_CESIUM_ION_TOKEN` enables terrain. The viewer works without it. Respect data-service terms; do not assume paid terrain/imagery is free. A browser token must be scoped to allowed origins/assets.
8. Hand tracking is opt-in and requires HTTPS (localhost also works), camera permission, compatible WebAssembly/worker support and access to the configured model URL. Self-host model bytes for offline deployments.
9. Configure a trusted reverse proxy correctly for IP budgets. Do not trust arbitrary forwarded headers. The current 20 requests/hour/IP and global concurrency cap are pilot safeguards, not account billing controls.

## API

- `POST /api/jobs` with QueryRequest -> HTTP 202 `{id,status}`.
- `GET /api/jobs/{id}` -> job status/message and final result.
- `DELETE /api/jobs/{id}` -> cancel an active job.
- `GET /api/geocode?q=...` -> `{results:[...]}`. Explicit search only; no keystroke autocomplete.
- `GET /media/artifacts/{sha256}.png` -> immutable analyzed raster.
- `GET /health` -> process availability (not all upstream readiness).

QueryRequest contains `query`, `language` (en/hi), `location`, `mode`, `date` or `date_range`, `radius_km`, and `tolerance_days`. Future dates, invalid coordinates and unordered comparisons are rejected.

Keep job IDs private: anyone possessing an ID can inspect/cancel that run. Add authenticated ownership before handling private project data. Public artifact IDs also act as content-addressed access links.

## Retention and cache

AOI observation reads are cached for 24 hours by pipeline version, coordinates, radius, target date, tolerance and sensor. Original PNGs are addressed by byte hash. Startup and pre-job cleanup enforce seven-day/1 GiB retention. Browser-saved results do not preserve server image bytes.

## Rollout

Deploy to a staging backend and preview frontend first. Verify source reads, paired inputs, image quality, model configuration, cancellation and browser controls before promoting. The PR is intentionally not a production deployment. Existing clients must migrate to the jobs API.

## Deployment asset and native-library checks

Build the backend using `backend/Dockerfile`. It installs `libexpat1` and CA certificates before Python packages, then imports Rasterio, PyProj, and the API during the build. If Render reports `libexpat.so.1` missing, deploy the updated Dockerfile; installing another Python package does not supply this OS library.

The frontend build verifies Cesium textures/workers and MediaPipe WASM at their public paths. The static-copy plugin preserves source directories by default, so the config explicitly strips the dependency path prefix. Do not remove these rename settings: missing texture URLs can return the SPA HTML and cause image decode failures.

## OPTIONS /api/jobs returns 400

Set Render's `FRONTEND_URL` to `https://sat-query-six.vercel.app` (or the exact frontend origin shown in your browser). For multiple deployments, provide a comma-separated list of their exact origins. Existing environment values override code defaults: a value containing only localhost must be updated in Render. Redeploy the backend after changing it. Preview deployment hostnames must be added explicitly; all Vercel sites are not trusted. Paths, queries and trailing slashes in configured URLs are normalized to browser origins. CORS permits POST/DELETE and Content-Type preflights; the request's Origin, requested method and requested headers determine whether it is accepted.

## Region search blocked by browser CORS

The live Render geocode endpoint returned HTTP 200 with results but no Access-Control-Allow-Origin for the production frontend. Both root and frontend Vercel configs now proxy `/api/*` and `/media/*` to `https://satquery.onrender.com` before the SPA fallback. The browser uses same-origin requests when VITE_API_BASE_URL is empty or equals that known Render URL. This works for preview origins too, without trusting all Vercel sites in backend CORS.

Redeploy Vercel to activate rewrites and rebuild the frontend. Leave VITE_API_BASE_URL empty for this setup. If your backend host changes, update both rewrite destinations; a custom VITE_API_BASE_URL continues to use direct requests and requires matching CORS. Local development defaults to local FastAPI. Raw latitude/longitude searches resolve in the browser and do not require a geocoding request. The backend is still required to run analysis.

## Public-data crop setup and refreshed frontend

The uploaded SatQuery reference is adapted into the React application: video landing page, green/dark palette, working question handoff, four feature routes, and `/datasets`. Demo account, mock authentication and fabricated results from the reference are not used. Existing root URLs with coordinates still open analysis. The compressed supplied video and static fallback live under `/visuals/` to avoid the `/media/` backend proxy. Reduced-motion users get the poster by default; everyone can pause the video.

Crop weather and satellite retrieval continue to use NASA POWER and Planetary Computer public endpoints. No new paid API provider was introduced. Satellite screening now attempts up to three candidates per half-season within the existing deadline, stopping after the first successful observation. Missing/uncalibrated pixels are never replaced with invented measurements.

An actual OGD key is necessary for the current district-history connector but is not sufficient: configure a verified `OGD_CROP_RESOURCE_ID`, `OGD_CROP_UNITS=hectares_tonnes` after verifying units, and `OGD_CROP_FIELDS` if needed. The official district-season catalogue describes area in hectares and production in tonnes, but the resource page could not be fetched during this change. No guessed resource ID is shipped. The UI distinguishes placeholder credentials, missing resource, missing location details, unverified units and provider failures. Never put a secret in a VITE variable. Automatic forecasts remain withheld pending a validated matched model.

Validation: 42 backend tests, 30 frontend tests, lint and production/static-asset build pass. The available browser cannot access the local preview (`ERR_BLOCKED_BY_CLIENT`), so visual browser validation remains outstanding. The existing Cesium chunk-size warning remains. Merge and redeploy both Render and Vercel to activate the backend retries and frontend design. This change does not alter your Render environment variables.

## General comparison and spectral views

`/water-change` remains a compatible URL but is now labelled **Compare Changes**. The two-image model is prompted to answer the actual question about visible vegetation, built-up areas, bare ground, agriculture, water or other supported features. Water SCL area screening is an optional supplement for water-related questions; its failure does not suppress an otherwise usable chronological image pair. Optical/radar answers explicitly distinguish sensor effects and acquisition dates. A configured Gemini key is still required for arbitrary paired-image answers; no free public geospatial data API is being represented as a general vision-language model.

Set `optical_views: true` in an imagery job to request optional scene classes, calibrated NDVI and false-colour B08/B04/B03 images. The frontend enables this by default and allows disabling it to reduce reads. A four-panel explorer displays available products from one scene, with a selector for before/after observations, legends and individual original links. NDVI uses a fixed −1…1 scale; false colour uses a fixed 0…0.4 calibrated reflectance stretch. SCL is a 20 m broad scene classification resampled to the display grid, not building/crop identification. Clouds and invalid pixels remain transparent. Missing optional bands produce a warning, never invented imagery. The model continues to receive original RGB evidence (plus original paired evidence); spectral display panels are not additional model inputs.

These views require extra remote raster reads and can increase job latency. No claim is made that every question can be answered at Sentinel resolution or that AI change interpretation is a measured land-cover change product. Live raster/browser verification is still required after deployment.
