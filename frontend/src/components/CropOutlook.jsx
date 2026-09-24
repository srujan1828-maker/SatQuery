import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { fetchGeocodeSuggestions, submitQuery } from "../api/query";
const Research = lazy(() => import("./CropResearch"));
const number = value => value == null ? "Unavailable" : Number(value).toFixed(2);
export default function CropOutlook() {
  const [research, setResearch] = useState(false);
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState([]);
  const [area, setArea] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const runAbort = useRef();
  const searchAbort = useRef();
  const version = useRef(0);
  const invalidate = () => { version.current++; runAbort.current?.abort(); setBusy(false); setResult(null); setError(""); };
  useEffect(() => () => { version.current++; runAbort.current?.abort(); searchAbort.current?.abort(); }, []);
  const locate = async () => {
    searchAbort.current?.abort(); const c = new AbortController(); searchAbort.current = c;
    setSearching(true); setError("");
    try {
      const found = await fetchGeocodeSuggestions(search, c.signal);
      if (!c.signal.aborted) { setMatches(found); if (!found.length) setError("No matching region. Try a nearby town or coordinates."); }
    } catch (e) { if (!c.signal.aborted) setError(e.message); }
    finally { if (!c.signal.aborted) setSearching(false); }
  };
  const submit = async event => {
    event.preventDefault(); invalidate();
    if (!area) { setError("Search for and select a location first."); return; }
    const f = new FormData(event.currentTarget);
    const body = { mode: "crop_auto", location: { lat: area.lat, lon: area.lon, name: area.name },
      crop: f.get("crop"), sowing_date: f.get("sowing_date"), date: f.get("date"), radius_km: Number(f.get("radius")),
      history_years: Number(f.get("history")), state: f.get("state"), district: f.get("district"), season: f.get("season") };
    const id = version.current; const c = new AbortController(); runAbort.current = c; setBusy(true); setProgress("Queued for automatic retrieval…");
    try {
      const data = await submitQuery(body, c.signal, message => { if (id === version.current) setProgress(message); });
      if (id === version.current) setResult(data);
    } catch (e) { if (id === version.current && e.name !== "AbortError") setError(e.message); }
    finally { if (id === version.current) setBusy(false); }
  };
  const exportResult = () => {
    const u = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = u; a.download = "crop-context.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  };
  return <>
    <div className="shell crop-switch"><button aria-pressed={!research} onClick={() => { invalidate(); setResearch(false); }}>Automatic retrieval</button>
      <button aria-pressed={research} onClick={() => { invalidate(); searchAbort.current?.abort(); setSearching(false); setResearch(true); }}>Advanced research dataset</button></div>
    {research ? <Suspense fallback={<p>Loading research tools…</p>}><Research /></Suspense> : <main className="shell crop-page">
      <header><div className="eyebrow">SATQUERY / AGRICULTURE</div><h1>Crop Outlook</h1>
        <p>Choose your region, crop and season dates. SatQuery retrieves available satellite observations, weather and configured historical yield records for you.</p></header>
      <section className="card"><h2>Choose a location</h2>
        <div className="crop-grid"><label>Region or coordinates<input value={search} onChange={e => { searchAbort.current?.abort(); setSearching(false); invalidate(); setSearch(e.target.value); setArea(null); setMatches([]); }} placeholder="Town, district, or latitude, longitude" /></label>
          <button onClick={locate} disabled={searching || search.trim().length < 2}>{searching ? "Searching…" : "Find region"}</button></div>
        <div className="search-results">{matches.map((m, i) => <button key={i} onClick={() => { invalidate(); setArea(m); setMatches([]); }}>{m.display_name || m.name}</button>)}</div>
        {area && <p>Selected: {area.name} ({area.lat.toFixed(4)}, {area.lon.toFixed(4)}). Retrieval covers the radius below around this point, not the entire administrative district.</p>}
      </section>
      <form className="card crop-form" onSubmit={submit} onChange={invalidate}>
        <h2>Basic crop details</h2><div className="crop-grid">
          <label>Crop<select name="crop"><option value="rice">Rice</option><option value="wheat">Wheat</option><option value="maize">Maize</option></select></label>
          <label>Sowing date<input type="date" name="sowing_date" min="2015-01-01" max={new Date().toISOString().slice(0,10)} required /></label>
          <label>Observation cutoff<input type="date" name="date" min="2015-01-01" max={new Date().toISOString().slice(0,10)} required /></label>
          <label>Area radius (km)<input type="number" name="radius" min="0.25" max="5" step="0.25" defaultValue="1" required /></label>
          <label>Past seasons to compare<select name="history" defaultValue="1"><option value="0">Current season only</option><option value="1">Previous season</option><option value="2">Previous two seasons</option></select></label>
        </div>
        <p>Choose a cutoff 30–180 days after sowing. Earlier years use the same calendar window as a comparison assumption.</p>
        <details><summary>Optional Indian yield-record matching</summary><div className="crop-grid">
          <label>State<input name="state" maxLength={100} placeholder="e.g. Punjab" /></label>
          <label>District<input name="district" maxLength={100} placeholder="Official district name" /></label>
          <label>Season<input name="season" maxLength={60} placeholder="e.g. Kharif" /></label>
        </div><p>Matching depends on the server's official yield-data connection and dataset coverage. No file upload is needed.</p></details>
        <button className="primary" disabled={busy || !area}>{busy ? "Retrieving data…" : "Retrieve crop data"}</button>
        {busy && <><p role="status">{progress} Satellite reads can take several minutes.</p><button type="button" onClick={invalidate}>Cancel retrieval</button></>}
      </form>
      {error && <p role="alert">{error}</p>}
      {result && <>
        <section className="card"><h2>Retrieved crop context</h2><p>{result.status === "context_ready" ? "Satellite and weather context retrieved." : "Partial results: some sources or observations were unavailable."} {result.cached ? "Using cached observations." : "Fresh retrieval."}</p>
          <p><strong>Yield forecast unavailable for this area.</strong> A validated model and matched crop-specific training data are still required.</p>
          <ul>{result.forecast.reasons.map(r => <li key={r}>{r}</li>)}</ul>
          <button onClick={exportResult}>Export retrieved data and sources</button></section>
        {result.seasons.map(s => <section className="card" key={s.year}><h2>{s.year} season</h2><p>{s.start} to {s.end}</p>
          <h3>Weather · {s.weather.status}</h3>
          {s.weather.expected_days ? <><p>Rainfall: {number(s.weather.rain_mm)} mm. Mean temperature: {number(s.weather.temperature_c)} °C.</p>
            <p>Coverage: rain {s.weather.rain_days}/{s.weather.expected_days} days; temperature {s.weather.temperature_days}/{s.weather.expected_days} days.</p>
            {s.weather.rain_mm == null && <p>Available-day rainfall subtotal: {number(s.weather.available_rain_mm)} mm. Missing days prevent a seasonal total.</p>}
            <a href={s.weather.source} target="_blank" rel="noreferrer">NASA POWER source</a></> : <p>{s.weather.message}</p>}
          {["optical", "radar"].map(key => <div key={key}><h3>{key === "optical" ? "Vegetation observations" : "Radar observations"} · {s[key].status}</h3>
            <p>{s[key].message || s[key].note}</p>
            {s[key].search_truncated && <p>Catalog results were truncated. This is not an exhaustive search.</p>}
            <ul>{s[key].observations?.map(o => <li key={o.scene_id}><a href={o.source} target="_blank" rel="noreferrer">{o.date} · {o.window}</a>: {key === "optical" ? `NDVI ${number(o.ndvi)}` : `VV ${number(o.vv_db)} dB, VH ${number(o.vh_db)} dB; orbit ${o.orbit}`}. Usable pixels: {Math.round(o.usable_fraction*100)}%.<br />{o.measurement}</li>)}</ul>
          </div>)}
        </section>)}
        <section className="card"><h2>Historical district yields · {result.yield_history.status}</h2><p>{result.yield_history.message}</p>
          {!!result.yield_history.records?.length && <div className="table-scroll"><table><thead><tr><th>Year</th><th>Area (ha)</th><th>Production (t)</th><th>Yield (t/ha)</th></tr></thead><tbody>{result.yield_history.records.map(r => <tr key={r.year}><td>{r.year}</td><td>{number(r.area_ha)}</td><td>{number(r.production_t)}</td><td>{number(r.yield_t_ha)}</td></tr>)}</tbody></table></div>}
          {result.yield_history.source && <a href={result.yield_history.source}>Official data source</a>}
          <ul>{result.warnings.map(w => <li key={w}>{w}</li>)}</ul></section>
      </>}
    </main>}
  </>;
}
