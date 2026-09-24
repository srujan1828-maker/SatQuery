import { lazy, Suspense, useEffect, useState } from "react";
import App from "./App";
import Landing from "./components/Landing";
import DataSources from "./components/DataSources";
import "./design.css";
const CropOutlook = lazy(() => import("./components/CropOutlook"));
const pages = [
  { path: "/ask", label: "Ask Satellite", mode: "vqa" },
  { path: "/water-change", label: "Water Change", mode: "change_detection" },
  { path: "/optical-radar", label: "Optical & Radar", mode: "fusion" },
  { path: "/crop-outlook", label: "Crop Outlook" },
];
export default function Pages() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onBack = () => setPath(location.pathname);
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);
  const page = pages.find(p => p.path === path);
  const home = path === "/" && !new URLSearchParams(location.search).has("lat");
  const activePage = page || (path === "/" && !home ? pages[0] : null);
  const navigate = (event, destination, question) => {
    if ((event.button != null && event.button !== 0) || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const params = new URLSearchParams(destination === "/" ? "" : location.search);
    params.delete("q");
    if (question) params.set("q", question);
    history.pushState({}, "", destination + (params.size ? "?" + params : ""));
    setPath(destination);
    window.scrollTo?.(0, 0);
  };
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <nav className="feature-nav" aria-label="SatQuery features">
      <a className="brand" href="/" onClick={e => navigate(e, "/")}><span aria-hidden="true">◉</span> SatQuery<span className="brand-dot">.</span></a>
      {pages.map(p => <a key={p.path} href={p.path + location.search} aria-current={activePage?.path === p.path ? "page" : undefined}
        onClick={e => navigate(e, p.path)}>{p.label}</a>)}
      <a href="/datasets" aria-current={path === "/datasets" ? "page" : undefined} onClick={e => navigate(e, "/datasets")}>Data sources</a>
    </nav>
    {home ? <Landing navigate={navigate} /> : path === "/datasets" ? <DataSources /> : !activePage ? <main className="shell"><h1>Page not found</h1><a href="/ask">Open Ask Satellite</a></main>
      : activePage.mode ? <App key={activePage.path} mode={activePage.mode} title={activePage.label} />
      : <Suspense fallback={<p className="shell" role="status">Loading Crop Outlook…</p>}><CropOutlook /></Suspense>}
    <footer className="site-footer"><span>SatQuery · Earth intelligence, made queryable.</span><span>Observed evidence. Transparent limitations.</span></footer>
  </>;
}
