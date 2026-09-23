import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { boundsFor } from "../geo.js";
export default function AreaMap({ lat, lon, radius, onSelect, result }) {
  const host = useRef(),
    map = useRef(),
    area = useRef(),
    evidence = useRef(),
    select = useRef(onSelect);
  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    const m = L.map(host.current).setView([0, 0], 2);
    map.current = m;
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 18,
        attribution: "Navigation imagery © Esri, Maxar, Earthstar Geographics",
      },
    ).addTo(m);
    area.current = L.rectangle(boundsFor(0, 0, 2.5), {
      color: "#69e3c7",
      weight: 2,
      fillOpacity: 0.1,
    }).addTo(m);
    evidence.current = L.layerGroup().addTo(m);
    m.on("click", (e) => {
      const p = e.latlng;
      if (Math.abs(p.lat) <= 80)
        select.current(p.lat, ((((p.lng + 180) % 360) + 360) % 360) - 180);
    });
    return () => m.remove();
  }, []);
  useEffect(() => {
    area.current?.setBounds(boundsFor(lat, lon, radius));
    map.current?.fitBounds(boundsFor(lat, lon, radius), {
      padding: [30, 30],
      maxZoom: 15,
    });
  }, [lat, lon, radius]);
  useEffect(() => {
    evidence.current?.clearLayers();
    if (result?.change_geojson)
      L.geoJSON(result.change_geojson, {
        style: (f) => ({
          color: f.properties.change === "water_gain" ? "#38bdf8" : "#fb923c",
          weight: 1,
        }),
      }).addTo(evidence.current);
  }, [result]);
  return (
    <>
      <div className="map" ref={host} />
      <p className="muted">
        Click to select the analysis centre. Rectangle shows the requested area.
        Basemap is navigation imagery, not the dated analysis evidence.
      </p>
    </>
  );
}
