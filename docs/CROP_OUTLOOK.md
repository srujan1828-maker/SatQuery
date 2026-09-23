# Crop Outlook: experimental dataset-driven forecasting

## What is implemented

`/crop-outlook` provides JSON historical-record import, a current-season measurement form, provenance collection, chronological model evaluation, a conditional experimental estimate, and JSON export. `POST /api/crops/evaluate` performs the calculation. The three existing analysis workflows now live at `/ask`, `/water-change`, and `/optical-radar`. `/` opens Ask Satellite. Existing Vercel SPA rewrites support direct navigation and refresh.

There is no preloaded agricultural dataset, pretrained model, automatic crop mask, calibrated radar extractor, weather connector, or farm-level prediction. Users supply actual measured features and yield labels. The current radar image-display pipeline cannot supply model inputs because its values are stretched for viewing. A successful software test is not evidence of predictive agricultural skill.

## Pilot preparation

1. Choose one crop, region and named growing season. Supported labels: rice, wheat, maize. This selection does not imply validated models for these crops.
2. Obtain historical district yields and stable district boundaries. The official Indian DES area/production/yield portal is a possible label source: https://data.desagri.gov.in/website/apy-query-report-web. Verify units, completeness and boundary changes before joining data.
3. Obtain crop-specific masks and sowing calendars for each year. Exclude non-crop pixels. Use the same spatial aggregation for yield labels and features.
4. Prepare calibrated, terrain-corrected radar observations. Use one consistent calibration, orbit policy and speckle-processing method. Record processing identifiers and scene references. Do not use RGB or stretched radar PNGs.
5. Define early and late growth windows entirely before a forecast cutoff, e.g. a research protocol with early days 1–45 and late days 46–90 at a day-90 cutoff. Use exactly that protocol in all seasons. Check actual sowing dates; fixed calendar dates alone can mix growth stages.
6. Compute district crop-masked VV/VH summaries in dB for the two windows. Document whether spatial/temporal averaging happens in power or dB and apply it consistently. Compute NDVI mean, cumulative rainfall in mm and mean temperature in °C using observations available only by the cutoff. Never fill historical features with data acquired after that year's forecast date.
7. Join verified harvest yield in tonnes/hectare to the historical observations. Supply at least 40 rows, five complete years, and five district records per year. These are software minimums, not a statistically sufficient sample-size claim.
8. Enter a later target year's measurements for a previously represented district. An optional expected harvested area in hectares enables a production estimate. Its error is not included in the displayed yield residual band.

## Historical JSON format

Upload an array of records with these exact keys. All numerical values must be measured finite numbers, not strings or nulls:

- `district`: stable district identifier/name
- `year`: harvest/season label year (consistent convention)
- `yield_t_ha`: observed yield in tonnes/hectare
- `vv_early_db`, `vh_early_db`, `vv_late_db`, `vh_late_db`: calibrated radar summaries
- `ndvi_mean`: vegetation-index mean, -1 to 1
- `rain_mm`: cumulative rainfall through the cutoff
- `temperature_c`: mean temperature through the cutoff

One row per district/year. No automatic imputation is performed. The page offers a blank record template; it intentionally contains no fabricated yield examples. The upload limit is 2 MB and 2,000 rows. The backend validates every value and rejects unknown keys.

## Evaluation and release gates

A fixed ridge regression (alpha 10) uses seven standardized numerical features. Scaling parameters come only from each fold's training data. The first three years provide the initial training history. Each subsequent year is predicted using only earlier years. There is no random row split or tuning on test folds. The comparison baseline is each district's historical mean, falling back to the training mean for a district unseen in a particular fold.

Report MAE/RMSE in tonnes/hectare, per-year errors, and actual vs. predicted held-out records. Fit the final research model on all historical rows only after evaluation. Withhold the target estimate if it fails to beat the average baseline, has out-of-range target features, or returns a nonpositive yield. These gates do not establish independent validity or detect all distribution shifts.

The displayed residual band is estimate ± the 90th percentile of absolute held-out errors, truncated at zero. It is descriptive, not a calibrated 90% prediction interval. There is no claim of confidence coverage. Dataset SHA-256 includes the complete submitted study and target; exports contain provenance, model version, features and held-out records.

No dataset or model is persisted by this endpoint. Computation is bounded to the submitted records and uses FastAPI's synchronous worker pool. Deployment remains the existing single-host application. For public scale, add authenticated access, per-user crop-compute budgets, durable private datasets, and an isolated training queue.

## Remaining work toward automatic forecasts

Build crop-mask ingestion and a dedicated calibrated radar/time-series connector, add weather ingestion, validate historical label joins, evaluate radar-only vs. optical/weather baselines, assess multiple withheld years and geographic holdouts, calibrate prediction intervals on independent data, and run a reviewed regional pilot. Add farm-level forecasts only with matched farm boundaries and harvest labels.

## Automatic retrieval (default interface)

The default page now accepts a searched location, crop, sowing date, observation cutoff, radius and 0–2 prior seasons. It posts `mode: crop_auto` to `/api/jobs` and uses existing concurrency limits, IP budgets, persistence, cancellation and subprocess deadlines. The previous JSON training workflow remains under Advanced research dataset.

Automatic connectors:

- NASA POWER daily point weather (`T2M`, `PRECTOTCORR`). Only dates up to the requested cutoff are used. Missing values are excluded and counted; incomplete rainfall is a subtotal, never a claimed seasonal total. Weather responses have a separate 24-hour cache to avoid repeated provider requests.
- Planetary Computer Sentinel-2 L2A: select at most one scene in each half of the season, read per-band scale/offset from STAC or original Sentinel product XML (including baseline-dependent BOA offsets), compute NDVI from B04/B08 on SCL vegetation pixels. No crop-specific classification is claimed.
- Planetary Computer Sentinel-1 RTC: use calibrated linear gamma0 VV/VH, take the median over valid AOI pixels and convert to dB. Select a consistent relative orbit/direction within each season. Cross-year orbit differences remain explicit. No GRD/display-stretch fallback is used. Catalog metadata notes potential subscription requirements; rejected source access is reported as unavailable.
- Indian OGD district yield history: one-time server setup requires `OGD_API_KEY`, a verified UUID in `OGD_CROP_RESOURCE_ID`, and `OGD_CROP_UNITS=hectares_tonnes` only after verifying the resource units. Optional `OGD_CROP_FIELDS` maps canonical field names (state_name, district_name, crop, season, crop_year, area, production) to the resource's fields. State, district and season are basic matching inputs. Keys never appear in client results. Exact crop/location matching, historical-year filtering, positive area and duplicate-year exclusion prevent misleading joins. Year ranges like 2020-21 are deliberately not guessed. This connector is not configured by default and has not been validated against a live keyed resource.

Satellite searches inspect at most the first 100 candidates, flag catalog truncation, and attempt at most two scenes per sensor/season. Rasters use a grid of at most 128x128 for bounded regional summaries. A 150-second soft retrieval budget fits inside the existing process deadline; individual source failures produce partial context. A complete satellite/weather context can be cached for 24 hours, but partial raster failures are retried on the next request. Results include acquired dates, scene URLs, coverage, per-source state and an export. Cache directories are bounded to roughly 200 JSON records each.

The radius is a small AOI around a selected location, not the whole district. General vegetation pixels and unmasked radar pixels do not identify the selected crop. Historical windows reuse the entered calendar sowing date as an assumption. District yield records are presented as context, not training labels for those AOI pixels.

**Automatic yield forecasting remains withheld:** no independently validated, crop-masked, geographically matched training pipeline is connected. The automatic path retrieves observations without asking users to prepare files; it does not manufacture crop yields from satellite snapshots. To activate a scientific forecasting product, obtain matched crop boundaries and multi-year labels, validate the regional model, then connect that model to this retrieval protocol. The research upload/evaluation path still exists for curated datasets.

Source references: https://power.larc.nasa.gov/docs/services/api/temporal/daily/ and https://planetarycomputer.microsoft.com/api/stac/v1/collections/sentinel-1-rtc and https://data.gov.in/resource/district-wise-season-wise-crop-production-statistics-1997 .

Automatic retrieval verification: 40 backend tests and 25 frontend tests pass. A live Punjab-area check returned complete NASA weather for 2024-06-01 through 2024-06-03, 18 Sentinel-2 candidates and 24 Sentinel-1 RTC candidates for June–September 2024, and successfully read original product XML reflectance calibration. These checks establish provider connectivity and metadata handling, not yield prediction accuracy. Raster access and keyed OGD integration must be verified in the deployment environment.
