import { useState } from "react";
import ImageViewer from "./ImageViewer";
import "./FusionInspector.css";

export default function FusionInspector({ opticalImage, radarImage, boxes = [] }) {
  const [blend, setBlend] = useState(50); // 0 = 100% optical, 100 = 100% radar
  const [viewMode, setViewMode] = useState("blend"); // "blend" | "side-by-side"

  if (!opticalImage || !radarImage) return null;

  if (viewMode === "side-by-side") {
    return (
      <div className="fusion-inspector-container">
        <div className="fusion-header">
          <span className="fusion-title">Sensor Fusion: Optical vs SAR Radar</span>
          <div className="comparison-mode-switch">
            <button
              type="button"
              className={`view-mode-btn ${viewMode === "blend" ? "active" : ""}`}
              onClick={() => setViewMode("blend")}
            >
              Opacity Blend
            </button>
            <button
              type="button"
              className={`view-mode-btn ${viewMode === "side-by-side" ? "active" : ""}`}
              onClick={() => setViewMode("side-by-side")}
            >
              Side-by-Side
            </button>
          </div>
        </div>

        <div className="comparison-grid">
          <section className="image-panel">
            <div className="panel-heading">
              <span>Sentinel-2 Optical (RGB)</span>
              <span>{opticalImage.date}</span>
            </div>
            <ImageViewer image={opticalImage} boxes={boxes} />
          </section>

          <section className="image-panel">
            <div className="panel-heading">
              <span>Sentinel-1 SAR Radar (C-band)</span>
              <span>{radarImage.date}</span>
            </div>
            <ImageViewer image={radarImage} boxes={boxes} />
          </section>
        </div>

        <div className="fusion-sci-panel">
          <div className="fusion-sci-title">Scientific Insight: Optical & Radar Complementarity</div>
          Sentinel-2 optical observations capture surface reflectance and land colors but are blocked by clouds and precipitation. Sentinel-1 Synthetic Aperture Radar (SAR) transmits microwave pulses (5.405 GHz) that penetrate cloud cover and night conditions, detecting water surfaces via specular backscatter reflection.
        </div>
      </div>
    );
  }

  const radarOpacity = blend / 100;

  return (
    <div className="fusion-inspector-container">
      <div className="fusion-header">
        <span className="fusion-title">Multimodal Sensor Fusion Inspector</span>
        <div className="fusion-controls">
          <div className="blend-slider-wrapper">
            <span className="blend-label">Optical</span>
            <input
              type="range"
              min="0"
              max="100"
              value={blend}
              onChange={(e) => setBlend(Number(e.target.value))}
              className="blend-slider"
              title="Drag to cross-fade between optical and SAR radar"
            />
            <span className="blend-label">Radar</span>
            <span className="blend-pct">{blend}%</span>
          </div>

          <div className="comparison-mode-switch">
            <button
              type="button"
              className={`view-mode-btn ${viewMode === "blend" ? "active" : ""}`}
              onClick={() => setViewMode("blend")}
            >
              Opacity Blend
            </button>
            <button
              type="button"
              className={`view-mode-btn ${viewMode === "side-by-side" ? "active" : ""}`}
              onClick={() => setViewMode("side-by-side")}
            >
              Side-by-Side
            </button>
          </div>
        </div>
      </div>

      <div className="fusion-stage">
        {/* Optical base layer */}
        <div className="fusion-layer">
          <img
            src={opticalImage.url}
            alt="Sentinel-2 Optical"
            className="fusion-layer-image"
          />
          <div className="fusion-sensor-tag fusion-sensor-tag--optical">
            OPTICAL (Sentinel-2) · {opticalImage.date}
          </div>
        </div>

        {/* Radar overlay layer with variable opacity */}
        <div
          className="fusion-layer"
          style={{ opacity: radarOpacity }}
        >
          <img
            src={radarImage.url}
            alt="Sentinel-1 SAR Radar"
            className="fusion-layer-image"
          />
          <div className="fusion-sensor-tag fusion-sensor-tag--radar">
            RADAR (Sentinel-1 SAR) · {radarImage.date}
          </div>
        </div>
      </div>

      <div className="fusion-sci-panel">
        <div className="fusion-sci-title">Multi-sensor Fusion Assessment</div>
        Slide to fade between Optical and Radar. In disaster and flood situations, cloud cover obscures optical imagery. SAR radar reveals standing water bodies as dark specular reflection zones regardless of weather conditions.
      </div>
    </div>
  );
}
