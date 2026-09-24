import { useState, useRef, useEffect } from "react";
function SpectralPanels({ images }) {
  const optical = images.filter(im => im.sensor === "sentinel-2" && (im.views?.length || im.view_warnings?.length));
  const [selected, setSelected] = useState(0);
  const [failed, setFailed] = useState({});
  const im = optical[selected] || optical[0];
  if (!im) return null;
  const panels = [{ kind: "natural", label: "Natural colour", url: im.url, method: im.render_method, legend: ["RGB appearance; transparent areas have no usable evidence"] }, ...[...im.views].sort((a,b) => ["false_colour", "ndvi", "scene_classes"].indexOf(a.kind) - ["false_colour", "ndvi", "scene_classes"].indexOf(b.kind))];
  return <section className="spectral-explorer" aria-label="Optical spectral views">
    <div className="toolbar"><h3>One observation. Four perspectives.</h3>
      {optical.length > 1 && <label>Optical observation<select value={selected} onChange={e => setSelected(Number(e.target.value))}>{optical.map((image, index) => <option key={image.id} value={index}>{image.role} · {image.date}</option>)}</select></label>}
    </div>
    <p className="muted">{im.role} · {im.date}. All panels cover the same area and acquisition. These are display products; the AI answer uses the original natural-colour evidence and any paired observation.</p>
    <div className="spectral-grid">{panels.map(v => <figure key={v.kind}>
      <figcaption><strong>{v.label}</strong><a href={v.url} target="_blank" rel="noreferrer">Open full view ↗</a></figcaption>
      {failed[v.url] ? <p role="alert">This view expired or failed to load. Retrieve observations again.</p> : <img src={v.url} alt={`${v.label}, ${im.role}, acquired ${im.date}`} loading="lazy" onError={() => setFailed(old => ({ ...old, [v.url]: true }))} />}
      <p className="spectral-legend">{v.legend.join(" · ")}</p><details><summary>How to interpret this view</summary><p>{v.method}</p>{v.sha256 && <p className="hash">SHA-256: {v.sha256}</p>}</details>
    </figure>)}</div>
    {im.view_warnings?.map(w => <p key={w} role="status">{w}</p>)}
  </section>;
}
export default function EvidenceViewer({ images }) {
  const [zoom, setZoom] = useState(1),
    [actual, setActual] = useState(false),
    [split, setSplit] = useState(50);
  const [contrast, setContrast] = useState(1),
    [brightness, setBrightness] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 }),
    [errors, setErrors] = useState({});
  const [availableWidth, setAvailableWidth] = useState(600);
  const host = useRef(null),
    drag = useRef(null);
  const first = images[0];
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setAvailableWidth(entry.contentRect.width),
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  if (!first) return null;
  const width =
    (actual ? first.width : Math.min(availableWidth, first.width)) * zoom;
  const height = (width * first.height) / first.width;
  const reset = () => {
    setZoom(1);
    setActual(false);
    setOffset({ x: 0, y: 0 });
    setContrast(1);
    setBrightness(1);
  };
  return (
    <section className="card evidence">
      <div className="toolbar">
        <h2>Observation evidence</h2>
        <div className="actions">
          <button
            onClick={() => {
              setActual(false);
              setZoom(1);
            }}
          >
            Fit
          </button>
          <button
            onClick={() => {
              setActual(true);
              setZoom(1);
            }}
          >
            Actual pixels
          </button>
          <button
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.5, z / 1.4))}
          >
            −
          </button>
          <button
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(8, z * 1.4))}
          >
            +
          </button>
          <button onClick={reset}>Reset / original</button>
          <button
            onClick={() => host.current?.requestFullscreen?.().catch(() => {})}
          >
            Fullscreen
          </button>
        </div>
      </div>
      <SpectralPanels images={images} />
      <h3>Original evidence / comparison</h3>
      <div
        ref={host}
        className="evidence-viewport"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            ...{ ox: offset.x, oy: offset.y },
          };
        }}
        onPointerMove={(e) => {
          if (drag.current)
            setOffset({
              x: drag.current.ox + e.clientX - drag.current.x,
              y: drag.current.oy + e.clientY - drag.current.y,
            });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        tabIndex={0}
        aria-label="Evidence view. Arrow keys pan; plus and minus zoom."
        onKeyDown={(e) => {
          if (
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
          ) {
            e.preventDefault();
            setOffset((o) => ({
              x:
                o.x +
                (e.key === "ArrowRight" ? 30 : e.key === "ArrowLeft" ? -30 : 0),
              y:
                o.y +
                (e.key === "ArrowDown" ? 30 : e.key === "ArrowUp" ? -30 : 0),
            }));
          }
          if (e.key === "+") setZoom((z) => Math.min(8, z * 1.4));
          if (e.key === "-") setZoom((z) => Math.max(0.5, z / 1.4));
        }}
      >
        <div
          className="raster-stage"
          style={{
            width,
            height,
            transform: `translate(${offset.x}px,${offset.y}px)`,
          }}
        >
          {images.slice(0, 2).map((im, i) => (
            <div
              key={im.id}
              className="raster-layer"
              style={{
                zIndex: 2 - i,
                clipPath:
                  i === 0 && images.length > 1
                    ? `inset(0 ${100 - split}% 0 0)`
                    : undefined,
              }}
            >
              {errors[im.id] ? (
                <p role="alert">
                  Evidence expired or failed to load. Run the query again.
                </p>
              ) : (
                <img
                  src={im.url}
                  alt={`${im.sensor} ${im.role}, acquired ${im.date}`}
                  draggable={false}
                  onError={() => setErrors((v) => ({ ...v, [im.id]: true }))}
                  style={{
                    filter: `contrast(${contrast}) brightness(${brightness})`,
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
      {images.length > 1 && (
        <label className="range">
          Compare {images[0].role} / {images[1].role}
          <input
            type="range"
            min="0"
            max="100"
            value={split}
            onChange={(e) => setSplit(+e.target.value)}
          />
        </label>
      )}
      <div className="toolbar">
        <label>
          Contrast{" "}
          <input
            type="range"
            min=".5"
            max="2"
            step=".05"
            value={contrast}
            onChange={(e) => setContrast(+e.target.value)}
          />
        </label>
        <label>
          Brightness{" "}
          <input
            type="range"
            min=".5"
            max="2"
            step=".05"
            value={brightness}
            onChange={(e) => setBrightness(+e.target.value)}
          />
        </label>
      </div>
      <p className="muted">
        {width > first.width
          ? "Magnified beyond output pixels — no additional observed detail. "
          : "Fit view does not enlarge the raster. "}
        Adjustments affect display only; both layers share the same settings.
        Drag or use arrow keys to pan.
      </p>
      {images.map((im) => (
        <details key={im.id}>
          <summary>
            {im.sensor} · {im.role} · {im.date} ·{" "}
            {Math.round(im.usable_fraction * 100)}% usable
          </summary>
          <dl>
            <dt>Requested / acquired</dt>
            <dd>
              {im.requested_date} / {im.date} ({im.date_offset_days} days)
            </dd>
            <dt>Source sampling / output</dt>
            <dd>
              {im.resolution_m} m · {im.width} × {im.height} px
            </dd>
            <dt>Rendering</dt>
            <dd>{im.render_method}</dd>
            <dt>Scene</dt>
            <dd>
              <a href={im.source_url} target="_blank" rel="noreferrer">
                {im.scene_id}
              </a>
            </dd>
            <dt>Evidence SHA-256</dt>
            <dd className="hash">{im.sha256}</dd>
          </dl>
          <a href={im.url} target="_blank" rel="noreferrer">
            Open original evidence PNG
          </a>
        </details>
      ))}
    </section>
  );
}
