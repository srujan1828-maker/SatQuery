# Remaining work and honest scope

Implemented now: evidence integrity, bounded source-raster reads, masking, date constraints, raster metadata and hashes, clearer viewers, experimental SCL change screening, partial results, jobs/cancel/budgets, browser-local saved runs, reports/GeoJSON, 2D map, 3D evidence globe and optional local gesture controls.

Before production promotion:
- Complete staging live raster/model/browser checks and real webcam/device validation.
- Calibrate/evaluate water-change accuracy on independent labels; SCL transitions do not prove a flood.
- Add authenticated project ownership/RBAC and account quotas for private/commercial use.
- Configure persistent storage and periodic cache cleanup; move to shared jobs/object storage before multi-instance scaling.

Next increments:
- Arbitrary polygon AOIs with area limits, geometry validation, dateline splitting and exact masked metrics.
- Acquisition browser with pagination and user-selected scene pairs, rather than bounded automatic candidate selection.
- Proper calibrated optical/SAR products and evaluated fusion; current radar mode is visual comparison.
- Higher-resolution provider integration after coverage, licence and customer willingness-to-pay validation. No purchases have been made.
- Team-shared projects, scheduled monitoring and notifications after account ownership/access controls.
- Evaluate gesture productivity; keep conventional controls as the default.

The globe currently has acquisition selection for returned observations, not a complete historical catalog timeline. Terrain is enabled only when configured. Reports export as Markdown/JSON, not a rendered PDF. These distinctions should remain visible in product claims.
