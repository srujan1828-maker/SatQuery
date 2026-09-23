# Validation and release gates

## Automated coverage

Tests exercise missing model/radar/image behavior, paired provider inputs, Hindi instructions, date/coordinate/area validation, equator/dateline handling, unchanged/class-change cases, cloud exclusion, mismatched grids, real local GeoTIFF reads, PNG byte hashing, API schema, cancellation and capacity. Frontend tests exercise native-pixel limits, shared transform/display controls, stale responses, zero coordinates, error messages, geocoder contract and hand-loss stop behavior.

## Scientific release gate — not complete

The current SCL class-transition method is a reproducible screening baseline, not a validated flood model. Scene classification errors, seasonal/permanent water, shadows and spatial mixing can affect results. Area totals include only pixels usable on both dates. A language model's explanation is not an accuracy measure.

Build an independent labelled set spanning geography, season, cloud cover and unchanged cases. Split by event/location, not neighboring pixels. Measure precision/recall/IoU, area error and analyst correction rates. Compare against a documented baseline. Have a remote-sensing reviewer approve task-specific thresholds and failure states before making operational claims.

## Browser and device gate

Test desktop/mobile layouts, fullscreen, comparison alignment, WebGL loss, denied camera permission, actual webcam tracking, low light, hand occlusion, mouse override, Escape and camera shutdown. Target at least 30 FPS on an agreed reference laptop; this is a target, not a measured claim.

The automated browser available during implementation blocked localhost, so browser visual/WebGL and physical-webcam validation must be completed in staging. Unit tests and production builds are not substitutes for those checks.

## Commercial gate

Interview three design partners, measure report-completion time and correction burden, and establish imagery resolution needs before buying imagery. No provider contract, pilot outcome or usability improvement is assumed by this implementation.

## Live upstream smoke checks

Sentinel-2 and Sentinel-1 catalog queries returned candidates with expected assets during implementation. Direct GDAL source-raster reads encountered a local certificate issuer trust error, including with the standard OS CA bundle. Certificate verification was left enabled. Confirm source COG reads in the target deployment before promotion; do not disable TLS verification to work around this error.
