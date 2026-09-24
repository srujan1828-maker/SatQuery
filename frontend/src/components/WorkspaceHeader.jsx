export default function WorkspaceHeader({ title, description, category = "EARTH OBSERVATION", sources = ["Sentinel-2", "Source-linked evidence"] }) {
  return <header className="workspace-heading"><div className="eyebrow">SATQUERY / {category}</div><div className="workspace-heading-row"><div><h1>{title}</h1><p>{description}</p></div><span className="workspace-mark" aria-hidden="true">◉</span></div><div className="source-chips">{sources.map(source => <span key={source}>{source}</span>)}</div></header>;
}
