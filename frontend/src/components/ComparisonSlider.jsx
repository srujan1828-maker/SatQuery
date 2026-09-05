import { useState, useRef, useEffect, useCallback } from "react";
import ImageViewer from "./ImageViewer";
import "./ComparisonSlider.css";

export default function ComparisonSlider({ beforeImage, afterImage, boxes = [] }) {
  const [sliderPos, setSliderPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useState("slider"); // "slider" | "split"
  const stageRef = useRef(null);

  const handleMove = useCallback(
    (clientX) => {
      if (!stageRef.current) return;
      const rect = stageRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSliderPos(percent);
    },
    []
  );

  const onMouseDown = () => setIsDragging(true);

  useEffect(() => {
    const onMouseUp = () => setIsDragging(false);
    const onMouseMove = (e) => {
      if (isDragging) {
        handleMove(e.clientX);
      }
    };
    const onTouchMove = (e) => {
      if (isDragging && e.touches.length > 0) {
        handleMove(e.touches[0].clientX);
      }
    };

    if (isDragging) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      window.addEventListener("touchmove", onTouchMove);
      window.addEventListener("touchend", onMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onMouseUp);
    };
  }, [isDragging, handleMove]);

  if (!beforeImage || !afterImage) return null;

  if (viewMode === "split") {
    return (
      <div className="comparison-slider-container">
        <div className="comparison-header">
          <span className="comparison-title">Multi-temporal Change View</span>
          <div className="comparison-mode-switch">
            <button
              type="button"
              className={`view-mode-btn ${viewMode === "slider" ? "active" : ""}`}
              onClick={() => setViewMode("slider")}
            >
              Swipe Slider
            </button>
            <button
              type="button"
              className={`view-mode-btn ${viewMode === "split" ? "active" : ""}`}
              onClick={() => setViewMode("split")}
            >
              Side-by-Side
            </button>
          </div>
        </div>

        <div className="comparison-grid">
          <section className="image-panel">
            <div className="panel-heading">
              <span>Before (Baseline)</span>
              <span>{beforeImage.date}</span>
            </div>
            <ImageViewer image={beforeImage} boxes={boxes} />
          </section>

          <section className="image-panel">
            <div className="panel-heading">
              <span>After (Observed Change)</span>
              <span>{afterImage.date}</span>
            </div>
            <ImageViewer image={afterImage} boxes={boxes} />
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="comparison-slider-container">
      <div className="comparison-header">
        <span className="comparison-title">Interactive Change Detection Swipe</span>
        <div className="comparison-mode-switch">
          <button
            type="button"
            className={`view-mode-btn ${viewMode === "slider" ? "active" : ""}`}
            onClick={() => setViewMode("slider")}
          >
            Swipe Slider
          </button>
          <button
            type="button"
            className={`view-mode-btn ${viewMode === "split" ? "active" : ""}`}
            onClick={() => setViewMode("split")}
          >
            Side-by-Side
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className="slider-stage"
        onMouseDown={onMouseDown}
        onTouchStart={onMouseDown}
      >
        {/* After image layer (base) */}
        <div className="slider-layer slider-layer--after">
          <img
            src={afterImage.url}
            alt="After change observation"
            className="slider-layer-image"
            draggable={false}
          />
          <div className="slider-badge slider-badge--right">
            AFTER: {afterImage.date}
          </div>
        </div>

        {/* Before image layer (clipped by sliderPos) */}
        <div
          className="slider-layer slider-layer--before"
          style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
        >
          <img
            src={beforeImage.url}
            alt="Before baseline observation"
            className="slider-layer-image"
            draggable={false}
          />
          <div className="slider-badge slider-badge--left">
            BEFORE: {beforeImage.date}
          </div>
        </div>

        {/* Draggable Divider Handle */}
        <div
          className="slider-divider"
          style={{ left: `${sliderPos}%` }}
        >
          <div className="slider-handle">
            <span>&#8596;</span>
          </div>
        </div>
      </div>

      <p className="slider-hint">
        Drag divider horizontally to visually contrast surface change between observations
      </p>
    </div>
  );
}
