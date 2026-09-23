import { useEffect, useRef, useState } from "react";
import { request } from "../api/query";
const fields = [
  ["vv_early_db", "Early-window VV (dB)", -60, 20], ["vh_early_db", "Early-window VH (dB)", -60, 20],
  ["vv_late_db", "Late-window VV (dB)", -60, 20], ["vh_late_db", "Late-window VH (dB)", -60, 20],
  ["ndvi_mean", "Mean NDVI", -1, 1], ["rain_mm", "Rainfall to cutoff (mm)", 0, 5000],
  ["temperature_c", "Mean temperature (°C)", -30, 60],
];
function download(name, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function CropResearch() {
  const [rows, setRows] = useState(null);
  const [filename, setFilename] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const controller = useRef();
  const revision = useRef(0);
  const fileRevision = useRef(0);
  const clear = () => { revision.current++; controller.current?.abort(); setBusy(false); setResult(null); setError(""); };
  useEffect(() => () => { revision.current++; fileRevision.current++; controller.current?.abort(); }, []);
  const upload = async e => {
    clear();
    const version = ++fileRevision.current;
    const file = e.target.files?.[0];
    setRows(null); setFilename("");
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error("Upload a JSON file under 2 MB.");
      const data = JSON.parse(await file.text());
      if (version !== fileRevision.current) return;
      if (!Array.isArray(data) || data.length < 40 || data.length > 2000) throw new Error("Supply an array of 40–2,000 historical district-season records.");
      setRows(data); setFilename(file.name);
    } catch (e) { if (version === fileRevision.current) setError(e.message); }
  };
  const submit = async event => {
    event.preventDefault(); clear();
    if (!rows) { setError("Upload historical measurements and actual yields first."); return; }
    const f = new FormData(event.currentTarget);
    const target = { district: f.get("district"), year: Number(f.get("year")) };
    fields.forEach(([key]) => { target[key] = Number(f.get(key)); });
    if (f.get("area")) target.harvested_area_ha = Number(f.get("area"));
    const body = {
      crop: f.get("crop"), season: f.get("season"), region: f.get("region"), forecast_day: Number(f.get("forecast_day")),
      radar_processing: "calibrated_rtc_db", observation_source: f.get("observation_source"),
      yield_source: f.get("yield_source"), protocol: f.get("protocol"), historical: rows, target,
    };
    const id = revision.current;
    const c = new AbortController(); controller.current = c; setBusy(true);
    const timeout = setTimeout(() => c.abort(), 30000);
    try {
      const data = await request("/api/crops/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: c.signal });
      if (revision.current === id) setResult(data);
    } catch (e) {
      if (revision.current === id) setError(e.name === "AbortError" ? "Request timed out or was cancelled. Retry when the backend is ready." : e.message);
    } finally { clearTimeout(timeout); if (revision.current === id) setBusy(false); }
  };
  const fmt = n => n == null ? "Unavailable" : Number(n).toFixed(2);
  return <main className="shell crop-page">
    <header><div className="eyebrow">SATQUERY / AGRICULTURE</div><h1>Research dataset evaluation</h1>
      <p>Evaluate historical radar, vegetation and weather measurements against actual district yields, then estimate a later season.</p></header>
    <section className="card"><h2>Start with measured data</h2>
      <p>This research workflow trains a small regression model from your dataset. No pretrained crop model or automatic calibrated radar extraction is connected. Existing radar display images cannot be used as measurements.</p>
      <p>Use one crop and season, at least five years, at least five districts per year, and 40 records overall. All measurements must stop at the same number of days after sowing. District records cannot establish farm-level yield.</p>
      <a href="https://data.desagri.gov.in/website/apy-query-report-web" target="_blank" rel="noreferrer">Find official Indian area, production and yield records</a>
      <details><summary>Dataset format and measurement requirements</summary>
        <p>Upload a JSON array. Each record needs district, year, yield_t_ha and the seven measurements below. Use calibrated terrain-corrected VV/VH in dB, crop-masked area statistics, consistent radar orbit handling and identical early/late growth windows. NDVI and weather must use only data available by the forecast cutoff.</p>
        <pre>{JSON.stringify({ district: "DISTRICT_NAME", year: "YEAR", yield_t_ha: "MEASURED_TONNES_PER_HECTARE", ...Object.fromEntries(fields.map(([key]) => [key, "MEASURED_NUMBER"])) }, null, 2)}</pre>
        <button type="button" onClick={() => download("crop-record-template.json", [{ district: "", year: null, yield_t_ha: null, ...Object.fromEntries(fields.map(([key]) => [key, null])) }])}>Download blank record template</button>
        <p>The template contains no sample yields. Replace placeholders with real measurements and add historical records.</p>
      </details>
    </section>
    <form className="card crop-form" onSubmit={submit} onChange={clear}>
      <h2>1. Historical dataset</h2>
      <label>Historical records (.json)<input type="file" accept=".json,application/json" onChange={upload} /></label>
      {rows && <p>{filename}: {rows.length} records loaded. They will be sent to the backend for evaluation, without permanent storage.</p>}
      <div className="crop-grid">
        <label>Crop<select name="crop"><option value="rice">Rice</option><option value="wheat">Wheat</option><option value="maize">Maize</option></select></label>
        <label>Season<input name="season" required maxLength={60} placeholder="e.g. Kharif" /></label>
        <label>Region<input name="region" required maxLength={120} placeholder="e.g. Punjab" /></label>
        <label>Forecast cutoff (days after sowing)<input name="forecast_day" type="number" min="30" max="180" required /></label>
      </div>
      <label>Observation source and processing version<textarea name="observation_source" minLength={10} maxLength={2000} required placeholder="Catalog/product, scene references or dataset identifier, preprocessing version" /></label>
      <label>Actual yield source<textarea name="yield_source" minLength={10} maxLength={2000} required placeholder="Dataset URL or documented harvest records and units" /></label>
      <label>Measurement protocol<textarea name="protocol" minLength={20} maxLength={4000} required placeholder="Crop mask, radar orbit, early/late day windows, rainfall/temperature source, aggregation, missing-data handling" /></label>
      <h2>2. Target season measurements</h2>
      <div className="crop-grid">
        <label>District<input name="district" maxLength={100} required /></label>
        <label>Target year<input name="year" type="number" min="2015" max={new Date().getFullYear()} required /></label>
        <label>Expected harvested area (ha, optional)<input name="area" type="number" step="any" min="0.001" max="10000000" /></label>
        {fields.map(([key, label, min, max]) => <label key={key}>{label}<input name={key} type="number" min={min} max={max} step="any" required /></label>)}
      </div>
      <label className="crop-confirm"><input type="checkbox" required /> I used actual yield records, crop-masked calibrated radar measurements and only observations available by the stated cutoff.</label>
      <button className="primary" disabled={busy || !rows}>{busy ? "Evaluating seasons…" : "Evaluate model and estimate yield"}</button>
      {busy && <button type="button" onClick={clear}>Cancel</button>}
    </form>
    {error && <p role="alert">{error}</p>}
    {result && <section className="card" aria-label="Crop evaluation results">
      <h2>{result.status === "withheld" ? "Forecast withheld" : "Experimental yield estimate"}</h2>
      <p>{result.crop} · {result.district} · {result.year} · day {result.forecast_day} after sowing</p>
      {result.withheld_reasons.map(reason => <p key={reason} role="alert">{reason}</p>)}
      {result.yield_t_ha != null && <><p className="crop-yield">{fmt(result.yield_t_ha)} <small>tonnes / hectare</small></p>
        <p>Historical-error band: {result.residual_band_t_ha.map(fmt).join("–")} t/ha. This is not a calibrated confidence interval.</p>
        {result.production_t != null && <p>Estimated production: {fmt(result.production_t)} tonnes, conditional on your harvested-area estimate.</p>}</>}
      <p>Held-out MAE: {fmt(result.mae_t_ha)} t/ha. Historical-average baseline MAE: {fmt(result.baseline_mae_t_ha)} t/ha.</p>
      <div className="table-scroll"><table><caption>Unseen-year evaluation</caption><thead><tr><th>Test year</th><th>Training rows</th><th>Test rows</th><th>Model MAE (t/ha)</th><th>Baseline MAE (t/ha)</th></tr></thead>
        <tbody>{result.validation_folds.map(f => <tr key={f.test_year}><td>{f.test_year}</td><td>{f.n_train}</td><td>{f.n_test}</td><td>{fmt(f.mae_t_ha)}</td><td>{fmt(f.baseline_mae_t_ha)}</td></tr>)}</tbody></table></div>
      <ul>{result.warnings.map(w => <li key={w}>{w}</li>)}</ul>
      <button onClick={() => download("crop-outlook-evaluation.json", result)}>Export evaluation and provenance</button>
    </section>}
  </main>;
}
