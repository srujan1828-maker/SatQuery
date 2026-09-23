import { lazy, Suspense, useEffect, useState } from "react";
import App from "./App";
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
  const page = pages.find(p => p.path === path) || (path === "/" ? pages[0] : null);
  const navigate = (event, destination) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    history.pushState({}, "", destination + location.search);
    setPath(destination);
  };
  return <>
    <nav className="feature-nav" aria-label="SatQuery features">
      <a className="brand" href="/ask" onClick={e => navigate(e, "/ask")}>SATQUERY</a>
      {pages.map(p => <a key={p.path} href={p.path + location.search} aria-current={page?.path === p.path ? "page" : undefined}
        onClick={e => navigate(e, p.path)}>{p.label}</a>)}
    </nav>
    {!page ? <main className="shell"><h1>Page not found</h1><a href="/ask">Open Ask Satellite</a></main>
      : page.mode ? <App key={page.path} mode={page.mode} title={page.label} />
      : <Suspense fallback={<p className="shell" role="status">Loading Crop Outlook…</p>}><CropOutlook /></Suspense>}
  </>;
}
