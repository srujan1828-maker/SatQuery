import { useState } from "react";
import ImageViewer from "./ImageViewer";
import "./FusionInspector.css";

export default function FusionInspector({ opticalImage, radarImage, boxes = [] }) {
  const [blend, setBlend] = useState(50); // 0 = 100% optical, 100 = 100% radar
  const [viewMode, setViewMode] = useState("blend"); // "blend" | "side-by-side"
  const [showBoxes, setShowBoxes] = useState(true);
  const [opticalError, setOpticalError] = useState(false);
  const [radarError, setRadarError] = useState(false);

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
              <span>Sentinel-1 SAR Radar (C-band VV)</span>
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

          {boxes && boxes.length > 0 && (
            <button
              type="button"
              className={`view-mode-btn ${showBoxes ? "active" : ""}`}
              onClick={() => setShowBoxes(!showBoxes)}
              title="Toggle AI detected feature boxes"
            >
              {showBoxes ? "Hide Boxes" : "Show Boxes"}
            </button>
          )}

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
          {opticalError ? (
            <div className="fusion-error-state">Optical Sentinel-2 image tile unavailable</div>
          ) : (
            <img
              src={opticalImage.url}
              alt="Sentinel-2 Optical"
              className="fusion-layer-image"
              onError={() => setOpticalError(true)}
            />
          )}
          <div className="fusion-sensor-tag fusion-sensor-tag--optical">
            OPTICAL (Sentinel-2) · {opticalImage.date}
          </div>
        </div>

        {/* Radar overlay layer with variable opacity */}
        <div
          className="fusion-layer"
          style={{ opacity: radarOpacity }}
        >
          {radarError ? (
            <div className="fusion-error-state">Sentinel-1 SAR Radar image tile unavailable</div>
          ) : (
            <img
              src={radarImage.url}
              alt="Sentinel-1 SAR Radar"
              className="fusion-layer-image"
              onError={() => setRadarError(true)}
            />
          )}
          <div className="fusion-sensor-tag fusion-sensor-tag--radar">
            RADAR (Sentinel-1 SAR VV) · {radarImage.date}
          </div>
        </div>

        {/* Overlay bounding boxes on top of both layers */}
        {showBoxes && boxes && boxes.length > 0 && (
          <div className="fusion-overlay-layer" aria-hidden="true">
            {boxes.map((box, idx) => (
              <div
                key={idx}
                className="fusion-box"
                style={{
                  left: `${box.x_min * 100}%`,
                  top: `${box.y_min * 100}%`,
                  width: `${(box.x_max - box.x_min) * 100}%`,
                  height: `${(box.y_max - box.y_min) * 100}%`,
                }}
              >
                <span className="fusion-box-label">
                  {box.label} ({Math.round((box.confidence || 0.8) * 100)}%)
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fusion-sci-panel">
        <div className="fusion-sci-title">Multi-Sensor Scientific Synthesis</div>
        Slide to fade between Optical (Sentinel-2) and SAR Radar (Sentinel-1). Optical reflectance captures visible landscape and chlorophyll colors, while microwave C-band SAR penetrates thick cloud cover, displaying water as dark specular reflection attenuation and built-up structures as bright double-bounce backscatter.
      </div>
    </div>
  );
}
