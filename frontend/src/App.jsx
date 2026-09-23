import { lazy, Suspense, useState, useRef, useEffect } from "react";
import { submitQuery, fetchGeocodeSuggestions } from "./api/query";
import AreaMap from "./components/AreaMap";
import EvidenceViewer from "./components/EvidenceViewer";
import "./App.css";
const Globe = lazy(() => import("./components/GlobeViewer"));
const iso = (d) => d.toISOString().slice(0, 10);
const recent = () => {
  const d = new Date();
  d.setDate(d.getDate() - 14);
  return iso(d);
};
const older = () => {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return iso(d);
};
function initial(mode = "vqa") {
  const p = new URLSearchParams(location.search);
  const coord = (key, fallback, min, max) => {
    const raw = p.get(key);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  return {
    query: "Describe visible water and land features, and explain limitations.",
    mode,
    language: "en",
    location: {
      lat: coord("lat", 28.6139, -80, 80),
      lon: coord("lon", 77.209, -180, 180),
      name: p.get("loc") || "Selected area",
    },
    date: recent(),
    date_range: { start: older(), end: recent() },
    radius_km: 2.5,
    tolerance_days: 10,
  };
}
function loadRuns() {
  try {
    return JSON.parse(localStorage.getItem("satquery-runs") || "[]");
  } catch {
    return [];
  }
}
function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function App({ mode = "vqa", title = "Ask Satellite" }) {
  const [form, setForm] = useState(() => initial(mode)),
    [result, setResult] = useState(null),
    [loading, setLoading] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState("");
  const [view, setView] = useState("2d"),
    [search, setSearch] = useState(""),
    [matches, setMatches] = useState([]),
    [runs, setRuns] = useState(loadRuns),
    [searching, setSearching] = useState(false);
  const queryAbort = useRef(),
    searchAbort = useRef(),
    version = useRef(0);
  const cancel = () => {
    version.current++;
    queryAbort.current?.abort();
    setLoading(false);
  };
  useEffect(
    () => () => {
      queryAbort.current?.abort();
      searchAbort.current?.abort();
    },
    [],
  );
  const change = (patch) => {
    cancel();
    setResult(null);
    setError("");
    setForm((f) => ({ ...f, ...patch }));
  };
  const select = (lat, lon, name = "Selected coordinates") => {
    change({ location: { lat, lon, name } });
    const u = new URL(location.href);
    u.searchParams.set("lat", lat.toFixed(5));
    u.searchParams.set("lon", lon.toFixed(5));
    u.searchParams.set("loc", name);
    history.replaceState({}, "", u);
  };
  const locate = async () => {
    searchAbort.current?.abort();
    const c = new AbortController();
    searchAbort.current = c;
    setSearching(true);
    setError("");
    try {
      const items = await fetchGeocodeSuggestions(search, c.signal);
      setMatches(items);
      if (!items.length)
        setError("No matching location. Try coordinates or a different name.");
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      if (!c.signal.aborted) setSearching(false);
    }
  };
  const run = async (e) => {
    e.preventDefault();
    cancel();
    const id = version.current;
    const c = new AbortController();
    queryAbort.current = c;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const r = await submitQuery(form, c.signal, setProgress);
      if (id !== version.current) return;
      setResult(r);
    } catch (e) {
      if (id === version.current && e.name !== "AbortError")
        setError(e.message);
    } finally {
      if (id === version.current) setLoading(false);
    }
  };
  const save = () => {
    const list = [
      result,
      ...runs.filter((r) => r.run_id !== result.run_id),
    ].slice(0, 10);
    try {
      localStorage.setItem("satquery-runs", JSON.stringify(list));
      setRuns(list);
    } catch {
      setError("Browser storage is full. Export the report instead.");
    }
  };
  const report = () =>
    download(
      `satquery-${result.run_id}.md`,
      [
        "# SatQuery evidence report",
        `Run: ${result.run_id}`,
        `Created: ${result.created_at}`,
        `Status: ${result.analysis_status}`,
        `Pipeline: ${result.pipeline_version}`,
        "## Request",
        "```json",
        JSON.stringify(result.request, null, 2),
        "```",
        "## Findings",
        result.answer_text,
        "## Limitations",
        ...result.warnings,
        "## Measurements",
        "```json",
        JSON.stringify(result.metrics, null, 2),
        "```",
        "## Evidence",
        ...result.images.map(
          (i) =>
            `- ${i.sensor}: acquired ${i.date}; requested ${i.requested_date}; usable ${Math.round(i.usable_fraction * 100)}%; scene ${i.scene_id}\n  Source: ${i.source_url}\n  PNG: ${i.url}\n  SHA-256: ${i.sha256}`,
        ),
        "\nExperimental screening; not independently validated or an emergency warning. Image links depend on server artifact retention. Save original PNGs for archival use.",
      ].join("\n\n"),
      "text/markdown",
    );
  return (
    <main className="shell">
      <header>
        <div className="eyebrow">SATQUERY / EARTH OBSERVATION</div>
        <h1>{title}</h1>
        <p>
          Explore dated satellite observations, compare areas and keep a
          traceable record of every result.
        </p>
      </header>
      <div className="workspace">
        <section className="card controls">
          <h2>Analysis workspace</h2>
          <form onSubmit={run}>
            <label>
              Question
              <textarea
                required
                maxLength={4000}
                rows={3}
                value={form.query}
                onChange={(e) => change({ query: e.target.value })}
              />
            </label>
            <div className="pair">
              <label>
                Latitude
                <input
                  required
                  type="number"
                  min="-80"
                  max="80"
                  step="any"
                  value={form.location.lat}
                  onChange={(e) =>
                    change({
                      location: {
                        ...form.location,
                        lat: e.target.value === "" ? "" : +e.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                Longitude
                <input
                  required
                  type="number"
                  min="-180"
                  max="180"
                  step="any"
                  value={form.location.lon}
                  onChange={(e) =>
                    change({
                      location: {
                        ...form.location,
                        lon: e.target.value === "" ? "" : +e.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
            <label>
              Area radius: {form.radius_km} km
              <input
                type="range"
                min=".25"
                max="5"
                step=".25"
                value={form.radius_km}
                onChange={(e) => change({ radius_km: +e.target.value })}
              />
            </label>
            {form.mode === "change_detection" ? (
              <div className="pair">
                <label>
                  Before
                  <input
                    required
                    type="date"
                    max={form.date_range.end}
                    value={form.date_range.start}
                    onChange={(e) =>
                      change({
                        date_range: {
                          ...form.date_range,
                          start: e.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  After
                  <input
                    required
                    type="date"
                    min={form.date_range.start}
                    max={iso(new Date())}
                    value={form.date_range.end}
                    onChange={(e) =>
                      change({
                        date_range: { ...form.date_range, end: e.target.value },
                      })
                    }
                  />
                </label>
              </div>
            ) : (
              <label>
                Requested date
                <input
                  required
                  type="date"
                  max={iso(new Date())}
                  value={form.date}
                  onChange={(e) => change({ date: e.target.value })}
                />
              </label>
            )}
            <div className="pair">
              <label>
                Date tolerance
                <select
                  value={form.tolerance_days}
                  onChange={(e) => change({ tolerance_days: +e.target.value })}
                >
                  {[0, 3, 10, 20, 30].map((n) => (
                    <option value={n} key={n}>
                      ±{n} days
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Answer language
                <select
                  value={form.language}
                  onChange={(e) => change({ language: e.target.value })}
                >
                  <option value="en">English</option>
                  <option value="hi">हिन्दी</option>
                </select>
              </label>
            </div>
            <button className="primary" type="submit" disabled={loading}>
              Retrieve and analyze
            </button>
            {loading && (
              <button type="button" onClick={cancel}>
                Cancel analysis
              </button>
            )}
          </form>
          <p className="muted">
            Sentinel-2 RGB: 10 m sampling. Enlarging an image does not reveal
            additional observed detail.
          </p>
        </section>
        <section className="card">
          <div className="toolbar">
            <h2>{form.location.name}</h2>
            <div className="actions">
              <button
                aria-pressed={view === "2d"}
                onClick={() => setView("2d")}
              >
                2D map
              </button>
              <button
                aria-pressed={view === "3d"}
                onClick={() => setView("3d")}
              >
                3D Earth
              </button>
            </div>
          </div>
          <div className="search">
            <input
              aria-label="Search place"
              placeholder="Search city or coordinates"
              value={search}
              onChange={(e) => {
                searchAbort.current?.abort();
                setSearching(false);
                setSearch(e.target.value);
                setMatches([]);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") locate();
              }}
            />
            <button
              onClick={locate}
              disabled={searching || search.trim().length < 2}
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
          {matches.length > 0 && (
            <ul className="matches">
              {matches.map((m, i) => (
                <li key={i}>
                  <button
                    onClick={() => {
                      select(m.lat, m.lon, m.name);
                      setMatches([]);
                    }}
                  >
                    {m.display_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {view === "2d" ? (
            <AreaMap
              lat={Number(form.location.lat) || 0}
              lon={Number(form.location.lon) || 0}
              radius={form.radius_km}
              onSelect={select}
              result={result}
            />
          ) : (
            <Suspense fallback={<p>Loading globe…</p>}>
              <Globe
                key={result?.run_id || "navigation"}
                lat={Number(form.location.lat) || 0}
                lon={Number(form.location.lon) || 0}
                radius={form.radius_km}
                onSelect={select}
                result={result}
              />
            </Suspense>
          )}
        </section>
      </div>
      {loading && (
        <div className="notice" role="status">
          <span className="pulse" />
          {progress || "Starting analysis…"} Source reads can take several
          minutes.
        </div>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {result && (
        <>
          <section className="card">
            <div className="toolbar">
              <h2>
                {result.analysis_status === "complete"
                  ? "Analysis returned"
                  : result.analysis_status === "partial"
                    ? "Partial result"
                    : "Evidence unavailable"}
              </h2>
              <span className="badge">Confidence: uncalibrated</span>
            </div>
            <p className="answer">{result.answer_text}</p>
            {result.error && <p role="alert">{result.error.message}</p>}
            <ul>
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            {result.metrics && (
              <>
                <div className="metrics">
                  <div>
                    <strong>{result.metrics.water_gain_ha} ha</strong>
                    Water-class gain
                  </div>
                  <div>
                    <strong>{result.metrics.water_loss_ha} ha</strong>
                    Water-class loss
                  </div>
                  <div>
                    <strong>
                      {Math.round(result.metrics.valid_overlap_fraction * 100)}%
                    </strong>
                    Usable overlap
                  </div>
                </div>
                <p className="muted">
                  20 m SCL classification, resampled to the display grid.
                  Experimental screening; not independently validated and not
                  proof of flooding.
                </p>
                {result.metrics.polygon_export_truncated && (
                  <p>
                    Polygon export limited to 1,000 features; area totals
                    include all classified changes.
                  </p>
                )}
              </>
            )}
            <div className="actions">
              <button onClick={save}>Save run in this browser</button>
              <button onClick={report}>Export report</button>
              <button
                onClick={() =>
                  download(
                    `satquery-${result.run_id}.json`,
                    JSON.stringify(result, null, 2),
                    "application/json",
                  )
                }
              >
                Export evidence JSON
              </button>
              {result.change_geojson && (
                <button
                  onClick={() =>
                    download(
                      "water-change.geojson",
                      JSON.stringify(result.change_geojson, null, 2),
                      "application/geo+json",
                    )
                  }
                >
                  Export change GeoJSON
                </button>
              )}
            </div>
          </section>
          {result.images.length > 0 && (
            <EvidenceViewer key={result.run_id} images={result.images} />
          )}
        </>
      )}
      {runs.length > 0 && (
        <section className="card">
          <h2>Saved runs · this browser</h2>
          <p className="muted">
            Saved reports remain here; server image links may expire. Export
            important evidence.
          </p>
          <div className="actions">
            {runs.filter(r => r.request.mode === mode).map((r) => (
              <button
                key={r.run_id}
                onClick={() => {
                  cancel();
                  setForm(r.request);
                  setResult(r);
                }}
              >
                {r.request.location.name} · {r.created_at?.slice(0, 10)}
              </button>
            ))}
            <button
              onClick={() => {
                localStorage.removeItem("satquery-runs");
                setRuns([]);
              }}
            >
              Clear saved runs
            </button>
          </div>
        </section>
      )}
      <footer>
        Evidence first. No generated imagery is substituted for missing
        observations. © OpenStreetMap contributors for location search.
      </footer>
    </main>
  );
}
