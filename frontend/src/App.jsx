import { useState } from "react";

import ImageViewer from "./components/ImageViewer";
import QueryPanel from "./components/QueryPanel";
import HonestyPanel from "./components/HonestyPanel";

import "./App.css";

const modes = ["vqa", "change_detection", "fusion_demo"];

const modeLabels = {
  vqa: "Visual Question Answering",
  change_detection: "Change Detection",
  fusion_demo: "Fusion Demo",
};

function App() {
  const [mode, setMode] = useState("vqa");
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleModeChange = (nextMode) => {
    setMode(nextMode);
    setData(null);
  };

  const handleResult = (result) => {
    setData(result);
  };

  const renderImages = () => {
    if (!data || !data.images) return null;

    if (data.mode === "change_detection") {
      const before = data.images.find(
        (image) => image.role === "before",
      );

      const after = data.images.find(
        (image) => image.role === "after",
      );

      return (
        <div className="comparison-grid">
          {before && (
            <section className="image-panel">
              <div className="panel-heading">
                <span>Before</span>
                <span>{before.date}</span>
              </div>

              <ImageViewer
                image={before}
                boxes={data.overlay_boxes}
              />
            </section>
          )}

          {after && (
            <section className="image-panel">
              <div className="panel-heading">
                <span>After</span>
                <span>{after.date}</span>
              </div>

              <ImageViewer
                image={after}
                boxes={data.overlay_boxes}
              />
            </section>
          )}
        </div>
      );
    }

    if (data.mode === "fusion_demo") {
      const optical = data.images.find(
        (image) => image.role === "optical",
      );

      const radar = data.images.find(
        (image) => image.role === "radar",
      );

      return (
        <div className="fusion-stack">
          {optical && (
            <section className="image-panel">
              <div className="panel-heading">
                <span>Optical Observation (Sentinel-2)</span>
                <span>{optical.date}</span>
              </div>

              <ImageViewer
                image={optical}
                boxes={data.overlay_boxes}
              />
            </section>
          )}

          {radar && (
            <section className="image-panel">
              <div className="panel-heading">
                <span>Radar Observation (Sentinel-1)</span>
                <span>{radar.date}</span>
              </div>

              <ImageViewer
                image={radar}
                boxes={data.overlay_boxes}
              />
            </section>
          )}
        </div>
      );
    }

    const image = data.images[0];

    if (!image) {
      return null;
    }

    return (
      <section className="image-panel">
        <div className="panel-heading">
          <span>Satellite Image</span>
          <span>{image.sensor} · {image.date}</span>
        </div>

        <ImageViewer
          image={image}
          boxes={data.overlay_boxes}
        />
      </section>
    );
  };

  const renderAnswerPanel = () => {
    if (!data) return null;

    return (
      <section className="answer-panel">
        <div className="section-label">
          {modeLabels[data.mode] || "ANSWER"}
        </div>

        <h2>{data.mode === "fusion_demo" ? "Takeaway Synthesis" : "Answer"}</h2>

        <p className="answer-text">
          {data.answer_text}
        </p>

        <div className="status-row">
          <span className="status-pill">
            Confidence: {data.confidence_flag}
          </span>

          {data.used_cache_fallback && (
            <span className="status-pill">
              Cache fallback used
            </span>
          )}
        </div>
      </section>
    );
  };

  const renderUncertaintyNotice = () => {
    if (
      !data ||
      (data.confidence_flag !== "low" &&
        data.confidence_flag !== "uncertain")
    ) {
      return null;
    }

    return (
      <section
        className="uncertainty-panel"
        role="status"
      >
        <p className="eyebrow">
          CONFIDENCE NOTICE
        </p>

        <strong>
          This result should be treated with caution.
        </strong>

        <p>
          The system has limited confidence ({data.confidence_flag}) in this
          response. Review the imagery and available evidence before relying on the result.
        </p>
      </section>
    );
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <section
          className="skeleton-panel"
          aria-live="polite"
          aria-label="Loading query results"
        >
          <div className="skeleton-line skeleton-line--title"></div>
          <div className="skeleton-line skeleton-line--body"></div>
          <div className="skeleton-line skeleton-line--body-short"></div>
          <div style={{ marginTop: "24px" }}>
            <div className="skeleton-image"></div>
          </div>
        </section>
      );
    }

    if (!data) {
      return (
        <section className="initial-state-panel">
          <h3>Ready for your query</h3>
          <p>
            Select a mode above, fill in your parameters, and submit to explore
            visual question answering, temporal change detection, or optical-radar sensor fusion.
          </p>
        </section>
      );
    }

    if (data.error) {
      return (
        <section className="error-panel" role="alert">
          <p className="eyebrow">QUERY ERROR</p>
          <strong>Unable to complete this query.</strong>
          <p>
            {typeof data.error === "string"
              ? data.error
              : data.error.message || "An unexpected error occurred."}
          </p>
        </section>
      );
    }

    if (data.mode === "fusion_demo") {
      return (
        <>
          <section className="visual-section">
            <div className="section-header">
              <div>
                <p className="eyebrow">GUIDED FUSION NARRATIVE</p>
                <h2>Optical and Radar Evidence</h2>
              </div>
            </div>

            {renderImages()}
          </section>

          {renderAnswerPanel()}
          {renderUncertaintyNotice()}
        </>
      );
    }

    if (data.mode === "change_detection") {
      return (
        <>
          <section className="visual-section">
            <div className="section-header">
              <div>
                <p className="eyebrow">OBSERVATIONS</p>
                <h2>Before and After</h2>
              </div>
            </div>

            {renderImages()}
          </section>

          {data.change_summary && (
            <section className="summary-panel">
              <p className="eyebrow">CHANGE SUMMARY</p>
              <p>{data.change_summary}</p>
            </section>
          )}

          {renderAnswerPanel()}
          {renderUncertaintyNotice()}
        </>
      );
    }

    // Default VQA mode
    return (
      <>
        {renderAnswerPanel()}
        {renderUncertaintyNotice()}

        <section className="visual-section">
          <div className="section-header">
            <div>
              <p className="eyebrow">OBSERVATIONS</p>
              <h2>Image evidence</h2>
            </div>
          </div>

          {renderImages()}
        </section>
      </>
    );
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">SATQUERY</p>

          <h1>
            Satellite intelligence, queried clearly.
          </h1>

          <p className="header-description">
            Explore visual answers, temporal changes, and
            complementary satellite observations.
          </p>
        </div>

        <div className="mode-switcher" role="tablist">
          {modes.map((modeKey) => (
            <button
              key={modeKey}
              type="button"
              className={`mode-button ${
                mode === modeKey
                  ? "mode-button--active"
                  : ""
              }`}
              onClick={() =>
                handleModeChange(modeKey)
              }
              role="tab"
              aria-selected={mode === modeKey}
            >
              {modeLabels[modeKey]}
            </button>
          ))}
        </div>
      </header>

      <QueryPanel
        mode={mode}
        onResult={handleResult}
        onLoadingChange={setIsLoading}
      />

      {renderContent()}

      <HonestyPanel />
    </main>
  );
}

export default App;