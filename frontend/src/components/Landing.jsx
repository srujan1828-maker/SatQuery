import { useEffect, useRef, useState } from "react";
const features = [
  ["01", "Ask Satellite", "/ask", "Ask questions about a dated satellite observation and inspect the evidence behind the answer."],
  ["02", "Water Change", "/water-change", "Compare observations across dates and screen for changes in visible water extent."],
  ["03", "Optical & Radar", "/optical-radar", "Explore complementary optical and radar observations for your selected area."],
  ["04", "Crop Outlook", "/crop-outlook", "Retrieve seasonal weather, vegetation, radar and available official crop records."],
];
export default function Landing({ navigate }) {
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState(false);
  const video = useRef(null);
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => {
      if (reduced?.matches) video.current?.pause();
      else video.current?.play()?.catch(() => {});
    };
    update(); reduced?.addEventListener("change", update);
    return () => reduced?.removeEventListener("change", update);
  }, []);
  return <main id="main-content" className="landing">
    <section className="earth-hero" aria-labelledby="hero-title">
      <video ref={video} className="earth-video" loop muted playsInline preload="none" poster="/visuals/earth-hero.jpg" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} aria-hidden="true"><source src="/visuals/earth-hero.mp4" type="video/mp4" /></video>
      <div className="hero-shade" />
      <div className="hero-content">
        <p className="eyebrow">A NEW PERSPECTIVE ON OUR PLANET</p>
        <h1 id="hero-title">Earth Intelligence,<br /><span>Made Queryable.</span></h1>
        <p className="hero-sub">Ask questions. Discover patterns. Understand our planet.</p>
        <form className="hero-query" onSubmit={e => { e.preventDefault(); navigate(e, "/ask", query.trim()); }}>
          <label className="sr-only" htmlFor="earth-question">Your satellite question</label>
          <input id="earth-question" value={query} onChange={e => setQuery(e.target.value)} maxLength={2000} placeholder="Ask a question about the Earth…" />
          <button className="primary" type="submit" aria-label="Open analysis with this question">Explore →</button>
        </form>
        <p className="examples-label">CHOOSE YOUR STARTING POINT</p>
        <div className="hero-chips"><a href="/water-change" onClick={e => navigate(e, "/water-change")}>Water changes ↗</a><a href="/crop-outlook" onClick={e => navigate(e, "/crop-outlook")}>Crop & season context ↗</a><a href="/optical-radar" onClick={e => navigate(e, "/optical-radar")}>Optical + radar ↗</a></div>
      </div>
      <div className="hero-bottom"><div><strong>Sentinel-1 & 2</strong><span>Satellite observations</span></div><div><strong>NASA POWER</strong><span>Seasonal weather</span></div><div><strong>Source-linked</strong><span>Evidence you can inspect</span></div><button className="video-toggle" onClick={() => { if (playing) video.current.pause(); else video.current.play()?.catch(() => {}); }}>{playing ? "Pause background" : "Play background"}</button></div>
    </section>
    <section className="explore-section" aria-labelledby="explore-title"><p className="eyebrow">YOUR EARTH OBSERVATION WORKSPACE</p><h2 id="explore-title">What would you like to explore?</h2><p className="muted">Four focused tools. Real observations. Clear limits.</p>
      <div className="feature-grid">{features.map(([number, name, path, description]) => <a key={path} className="feature-tile" href={path} onClick={e => navigate(e, path)}><span className="tile-number">{number} /</span><h3>{name} <span aria-hidden="true">↗</span></h3><p>{description}</p></a>)}</div>
    </section>
  </main>;
}
