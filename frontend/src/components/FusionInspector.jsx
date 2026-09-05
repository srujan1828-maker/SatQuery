import { useState, useRef, useEffect, useCallback } from "react";
import ImageViewer from "./ImageViewer";
import "./FusionInspector.css";

export default function FusionInspector({ opticalImage, radarImage, boxes = [] }) {
  // View modes: "split" (wipe slider) | "blend" (opacity crossfade) | "side-by-side" | "composite"
  const [viewMode, setViewMode] = useState("split");
  const [splitPos, setSplitPos] = useState(50); // 0 to 100 percent
  const [blend, setBlend] = useState(50); // 0 = 100% optical, 100 = 100% radar
  const [showBoxes, setShowBoxes] = useState(true);

  const [opticalLoaded, setOpticalLoaded] = useState(false);
  const [radarLoaded, setRadarLoaded] = useState(false);
  const [opticalError, setOpticalError] = useState(false);
  const [radarError, setRadarError] = useState(false);

  const stageRef = useRef(null);
  const isDraggingRef = useRef(false);

  // Reset loading and error states when new imagery arrives
  useEffect(() => {
    setOpticalLoaded(false);
    setRadarLoaded(false);
    setOpticalError(false);
    setRadarError(false);
  }, [opticalImage?.url, radarImage?.url]);

  const handlePointerDown = (e) => {
    isDraggingRef.current = true;
    updateSplitPosition(e.clientX);
  };

  const updateSplitPosition = useCallback((clientX) => {
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (relativeX / rect.width) * 100));
    setSplitPos(percentage);
  }, []);

  useEffect(() => {
    const handlePointerMove = (e) => {
      if (!isDraggingRef.current) return;
      updateSplitPosition(e.clientX);
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [updateSplitPosition]);

  if (!opticalImage || !radarImage) {
    return (
      <div className="fusion-inspector-container">
        <div className="fusion-empty-notice">
          Waiting for aligned optical and microwave radar satellite observations...
        </div>
      </div>
    );
  }

  const isLoading = (!opticalLoaded && !opticalError) || (!radarLoaded && !radarError);

  const renderBoxes = (imgId) => {
    if (!showBoxes || !boxes || boxes.length === 0) return null;
    return (
      <div className="fusion-overlay-layer" aria-hidden="true">
        {boxes.map((box, idx) => {
          if (imgId && box.image_id && box.image_id !== imgId) return null;
          return (
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
                {box.label} ({Math.round((box.confidence || 0.85) * 100)}%)
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fusion-inspector-container">
      {/* Top Header and Control Bar */}
      <div className="fusion-header">
        <div className="fusion-title-group">
          <span className="fusion-badge">MULTIMODAL EO</span>
          <h3 className="fusion-title">Optical & Microwave SAR Radar Fusion</h3>
        </div>

        <div className="fusion-mode-tabs" role="tablist">
          <button
            type="button"
            className={`view-mode-btn ${viewMode === "split" ? "active" : ""}`}
            onClick={() => setViewMode("split")}
            title="Interactive left-to-right swipe split between optical and radar"
          >
            Split Swipe
          </button>
          <button
            type="button"
            className={`view-mode-btn ${viewMode === "blend" ? "active" : ""}`}
            onClick={() => setViewMode("blend")}
            title="Continuous opacity cross-fade"
          >
            Opacity Blend
          </button>
          <button
            type="button"
            className={`view-mode-btn ${viewMode === "side-by-side" ? "active" : ""}`}
            onClick={() => setViewMode("side-by-side")}
            title="Side-by-side optical vs radar comparison"
          >
            Side-by-Side
          </button>
          <button
            type="button"
            className={`view-mode-btn ${viewMode === "composite" ? "active" : ""}`}
            onClick={() => setViewMode("composite")}
            title="False-color optical/radar composite overlay"
          >
            Color Composite
          </button>
        </div>
      </div>

      {/* Sub-toolbar with context-specific controls */}
      <div className="fusion-subtoolbar">
        {viewMode === "split" && (
          <div className="fusion-tool-group">
            <span className="tool-label">Swipe Position:</span>
            <div className="quick-presets">
              <button type="button" className={`preset-pill ${Math.round(splitPos) === 25 ? "active" : ""}`} onClick={() => setSplitPos(25)}>25%</button>
              <button type="button" className={`preset-pill ${Math.round(splitPos) === 50 ? "active" : ""}`} onClick={() => setSplitPos(50)}>50% (Center)</button>
              <button type="button" className={`preset-pill ${Math.round(splitPos) === 75 ? "active" : ""}`} onClick={() => setSplitPos(75)}>75%</button>
            </div>
          </div>
        )}

        {viewMode === "blend" && (
          <div className="fusion-tool-group">
            <span className="tool-label">Optical</span>
            <input
              type="range"
              min="0"
              max="100"
              value={blend}
              onChange={(e) => setBlend(Number(e.target.value))}
              className="blend-slider"
              title="Slide between 100% optical and 100% radar"
            />
            <span className="tool-label">Radar</span>
            <span className="blend-pct-tag">{blend}% Radar</span>
            <div className="quick-presets">
              <button type="button" className="preset-pill" onClick={() => setBlend(0)}>Optical Only</button>
              <button type="button" className="preset-pill" onClick={() => setBlend(50)}>50/50</button>
              <button type="button" className="preset-pill" onClick={() => setBlend(100)}>Radar Only</button>
            </div>
          </div>
        )}

        {viewMode === "composite" && (
          <div className="fusion-tool-group">
            <span className="composite-info-tag">
              Optical Surface Reflectance (RGB) + Sentinel-1 SAR Microwave Dielectric Backscatter
            </span>
          </div>
        )}

        {boxes && boxes.length > 0 && (
          <button
            type="button"
            className={`box-toggle-btn ${showBoxes ? "active" : ""}`}
            onClick={() => setShowBoxes(!showBoxes)}
          >
            {showBoxes ? "Hide Detections" : `Show Detections (${boxes.length})`}
          </button>
        )}
      </div>

      {/* Main Interactive Visual Stage */}
      {viewMode === "side-by-side" ? (
        <div className="comparison-grid">
          <section className="image-panel">
            <div className="panel-heading">
              <span>Sentinel-2 Optical (MSI True Color)</span>
              <span>Acquired: {opticalImage.date}</span>
            </div>
            <ImageViewer image={opticalImage} boxes={showBoxes ? boxes : []} />
          </section>

          <section className="image-panel">
            <div className="panel-heading">
              <span>Sentinel-1 SAR Radar (C-Band VV Polarization)</span>
              <span>Acquired: {radarImage.date}</span>
            </div>
            <ImageViewer image={radarImage} boxes={showBoxes ? boxes : []} />
          </section>
        </div>
      ) : (
        <div
          ref={stageRef}
          className={`fusion-stage ${viewMode === "split" ? "fusion-stage--split" : ""}`}
          onPointerDown={viewMode === "split" ? handlePointerDown : undefined}
        >
          {isLoading && (
            <div className="fusion-loading-overlay">
              <div className="fusion-scanner-ring" />
              <span>Aligning Sentinel-2 Optical and Sentinel-1 SAR Radar Swaths...</span>
            </div>
          )}

          {/* Underlayer: Radar Image (Right in split mode, or cross-fade base) */}
          <div className="fusion-layer fusion-layer--radar">
            {radarError ? (
              <div className="fusion-error-fallback">
                <span>Sentinel-1 SAR Radar Imagery Currently Unavailable</span>
              </div>
            ) : (
              <img
                src={radarImage.url}
                alt="Sentinel-1 SAR Radar VV"
                className="fusion-image"
                onLoad={() => setRadarLoaded(true)}
                onError={() => { setRadarLoaded(true); setRadarError(true); }}
              />
            )}
            <div className="sensor-tag sensor-tag--radar">
              RADAR: Sentinel-1 C-Band SAR (VV) · {radarImage.date}
            </div>
          </div>

          {/* Overlayer: Optical Image */}
          {viewMode === "split" ? (
            <div
              className="fusion-layer fusion-layer--optical-split"
              style={{ clipPath: `polygon(0 0, ${splitPos}% 0, ${splitPos}% 100%, 0 100%)` }}
            >
              {opticalError ? (
                <div className="fusion-error-fallback">
                  <span>Sentinel-2 Optical Imagery Currently Unavailable</span>
                </div>
              ) : (
                <img
                  src={opticalImage.url}
                  alt="Sentinel-2 Optical RGB"
                  className="fusion-image"
                  onLoad={() => setOpticalLoaded(true)}
                  onError={() => { setOpticalLoaded(true); setOpticalError(true); }}
                />
              )}
              <div className="sensor-tag sensor-tag--optical">
                OPTICAL: Sentinel-2 MSI (RGB) · {opticalImage.date}
              </div>
            </div>
          ) : viewMode === "blend" ? (
            <div
              className="fusion-layer fusion-layer--optical-blend"
              style={{ opacity: 1 - (blend / 100) }}
            >
              {opticalError ? (
                <div className="fusion-error-fallback">
                  <span>Sentinel-2 Optical Imagery Currently Unavailable</span>
                </div>
              ) : (
                <img
                  src={opticalImage.url}
                  alt="Sentinel-2 Optical RGB"
                  className="fusion-image"
                  onLoad={() => setOpticalLoaded(true)}
                  onError={() => { setOpticalLoaded(true); setOpticalError(true); }}
                />
              )}
              <div className="sensor-tag sensor-tag--optical">
                OPTICAL: Sentinel-2 MSI (RGB) · {opticalImage.date}
              </div>
            </div>
          ) : (
            /* Composite Mode */
            <div className="fusion-layer fusion-layer--composite">
              <img
                src={opticalImage.url}
                alt="Sentinel-2 Optical RGB"
                className="fusion-image"
                onLoad={() => setOpticalLoaded(true)}
                onError={() => { setOpticalLoaded(true); setOpticalError(true); }}
              />
              <div className="sensor-tag sensor-tag--composite">
                FALSE-COLOR SENSOR FUSION COMPOSITE
              </div>
            </div>
          )}

          {/* Interactive Split Divider Handle (in Split Mode) */}
          {viewMode === "split" && (
            <div
              className="split-divider-line"
              style={{ left: `${splitPos}%` }}
            >
              <div className="split-handle-grip" title="Drag left or right to swipe">
                <span className="split-arrow">&lsaquo;</span>
                <span className="split-arrow">&rsaquo;</span>
              </div>
            </div>
          )}

          {/* AI Bounding Box Overlays */}
          {renderBoxes()}
        </div>
      )}

      {/* Physical & Remote Sensing Technical Breakdown */}
      <div className="fusion-meta-grid">
        <div className="fusion-meta-card">
          <div className="meta-card-header">
            <span className="meta-dot meta-dot--optical" />
            <strong>Sentinel-2 (Optical Surface Reflectance)</strong>
          </div>
          <p className="meta-card-text">
            Captures visible light (490–665 nm) and near-infrared reflectance. Essential for assessing vegetation vigor (NDVI), urban sprawl, and natural terrain coloration, but completely obstructed by clouds, haze, and nocturnal conditions.
          </p>
          <div className="meta-pills">
            <span className="meta-pill">Constellation: S2A / S2B</span>
            <span className="meta-pill">Resolution: 10m GSD</span>
            <span className="meta-pill">Band: B04, B03, B02 (RGB)</span>
          </div>
        </div>

        <div className="fusion-meta-card">
          <div className="meta-card-header">
            <span className="meta-dot meta-dot--radar" />
            <strong>Sentinel-1 (Microwave Synthetic Aperture Radar)</strong>
          </div>
          <p className="meta-card-text">
            Emits active C-band microwave pulses (5.405 GHz / 5.55 cm). Penetrates cloud cover, monsoons, and nighttime. Water surfaces appear pitch black (&lt; -20 dB) due to specular reflection, while concrete buildings and metallic structures produce bright corner double-bounces.
          </p>
          <div className="meta-pills">
            <span className="meta-pill">Polarization: VV (Co-polar)</span>
            <span className="meta-pill">Mode: IW GRD</span>
            <span className="meta-pill">Pixel-Aligned Zoom 14</span>
          </div>
        </div>
      </div>
    </div>
  );
}
