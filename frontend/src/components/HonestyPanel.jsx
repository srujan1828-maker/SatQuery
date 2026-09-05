import "./HonestyPanel.css";

function HonestyPanel() {
  return (
    <section className="honesty-panel">
      <div>
        <p className="eyebrow">ABOUT THE RESULT</p>

        <h2>Use satellite evidence with context.</h2>

        <p className="honesty-panel__description">
          SatQuery presents model-generated answers alongside
          the satellite observations used for the response.
          Results may be uncertain when the available imagery
          or model evidence is limited.
        </p>
      </div>

      <div className="honesty-panel__items">
        <div className="honesty-panel__item">
          <strong>Evidence first</strong>

          <span>
            Review the imagery and annotations alongside the
            generated answer.
          </span>
        </div>

        <div className="honesty-panel__item">
          <strong>Confidence matters</strong>

          <span>
            Low-confidence or uncertain results should be
            treated with caution.
          </span>
        </div>

        <div className="honesty-panel__item">
          <strong>Development status</strong>

          <span>
            Current imagery includes development mock assets
            and is not representative of final satellite data.
          </span>
        </div>
      </div>
    </section>
  );
}

export default HonestyPanel;