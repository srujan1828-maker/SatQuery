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
