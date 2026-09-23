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
