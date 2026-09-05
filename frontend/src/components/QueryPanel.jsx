import { useState } from "react";
import { submitQuery } from "../api/query.js";
import InteractiveMap from "./InteractiveMap";
import "./QueryPanel.css";

const modeLabels = {
  vqa: "Visual Question Answering",
  change_detection: "Change Detection",
  fusion: "Sensor Fusion",
  fusion_demo: "Sensor Fusion",
};

const SUGGESTIONS = {
  vqa: [
    "Detect surface water bodies, lakes, and drainage channels.",
    "Identify urban sprawl, road connectivity, and built structures.",
    "Assess active vegetation vigor and agricultural parcel health.",
    "Identify coastal features, ports, and maritime activity.",
  ],
  change_detection: [
    "Detect surface water expansion and flood inundation changes.",
    "Identify new urban construction or land clearance between dates.",
    "Analyze vegetation degradation or seasonal cropland difference.",
  ],
  fusion: [
    "Detect flood extent and standing water by fusing optical and SAR radar.",
    "Analyze urban building density using optical imagery and radar double-bounce backscatter.",
    "Penetrate cloud cover using Sentinel-1 C-band SAR over agricultural terrain.",
    "Analyze coastal port infrastructure and maritime vessels with radar-optical fusion.",
  ],
  fusion_demo: [
    "Detect flood extent and standing water by fusing optical and SAR radar.",
    "Analyze urban building density using optical imagery and radar double-bounce backscatter.",
    "Penetrate cloud cover using Sentinel-1 C-band SAR over agricultural terrain.",
    "Analyze coastal port infrastructure and maritime vessels with radar-optical fusion.",
  ],
};

function QueryPanel({ mode, onResult, onLoadingChange, isLoading = false }) {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("en");
  const [locationName, setLocationName] = useState("New Delhi");
  const [latitude, setLatitude] = useState("28.6139");
  const [longitude, setLongitude] = useState("77.2090");
  const [date, setDate] = useState("2024-05-12");
  const [startDate, setStartDate] = useState("2023-05-12");
  const [endDate, setEndDate] = useState("2024-05-12");
  const [showMap, setShowMap] = useState(true);

  const isFusion = mode === "fusion" || mode === "fusion_demo";
  const isChangeDetection = mode === "change_detection";

  const handleLocationSelect = ({ lat, lon, name }) => {
    setLatitude(lat.toString());
    setLongitude(lon.toString());
    if (name) {
      setLocationName(name);
    }
  };

  const handleSuggestionClick = (suggestedText) => {
    setQuery(suggestedText);
  };

  const buildRequestBody = () => {
    const body = {
      query: query.trim(),
      language,
      mode,
    };

    if (latitude && longitude) {
      body.location = {
        lat: Number(latitude),
        lon: Number(longitude),
      };

      if (locationName.trim()) {
        body.location.name = locationName.trim();
      }
    }

    if (mode === "vqa" || isFusion) {
      body.date = date;
    }

    if (isChangeDetection) {
      body.date_range = {
        start: startDate,
        end: endDate,
      };
    }

    return body;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!query.trim()) {
      return;
    }

    if (!latitude || !longitude) {
      return;
    }

    if ((mode === "vqa" || isFusion) && !date) {
      return;
    }

    if (isChangeDetection && (!startDate || !endDate)) {
      return;
    }

    const requestBody = buildRequestBody();
    onLoadingChange(true);

    try {
      const response = await submitQuery(requestBody);
      onResult(response);
    } catch (error) {
      onResult({
        mode,
        answer_text: "An unexpected error occurred while querying.",
        images: [],
        overlay_boxes: [],
        change_summary: null,
        confidence_flag: "uncertain",
        used_cache_fallback: false,
        error: {
          code: "unexpected_error",
          message: error.message || "Failed to execute query.",
        },
      });
    } finally {
      onLoadingChange(false);
    }
  };

  return (
    <section className="query-panel">
      <div className="query-panel__header">
        <div>
          <p className="eyebrow">QUERY CONSOLE</p>
          <h2>{modeLabels[mode]}</h2>
        </div>

        <span className="query-panel__mode">{mode}</span>
      </div>

      <form className="query-form" onSubmit={handleSubmit}>
        <div className="query-field query-field--full">
          <label htmlFor="query">What do you want to analyze?</label>

          <textarea
            id="query"
            name="query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              mode === "vqa"
                ? "Ask a question about the satellite scene (e.g. Detect water bodies, inspect urban boundaries)..."
                : mode === "change_detection"
                  ? "Describe what changes to detect between baseline and current observations..."
                  : "Describe what to analyze using multimodal optical and radar sensor fusion..."
            }
            rows={3}
          />

          <div className="query-suggestions">
            {(SUGGESTIONS[mode] || []).map((text) => (
              <button
                key={text}
                type="button"
                className="suggestion-chip"
                onClick={() => handleSuggestionClick(text)}
              >
                + {text}
              </button>
            ))}
          </div>
        </div>

        <div className="map-toggle-bar">
          <span className="eyebrow">
            {isFusion
              ? "GEOSPATIAL TARGETING (OPTICAL & SAR RADAR FOOTPRINT)"
              : "GEOSPATIAL TARGETING (SENTINEL-2 FOOTPRINT)"}
          </span>
          <button
            type="button"
            className="map-toggle-btn"
            onClick={() => setShowMap(!showMap)}
          >
            {showMap ? "Hide Interactive Map" : "Show Live Interactive Map"}
          </button>
        </div>

        {showMap && (
          <div className="query-field--full">
            <InteractiveMap
              latitude={latitude}
              longitude={longitude}
              locationName={locationName}
              onLocationSelect={handleLocationSelect}
            />
          </div>
        )}

        <div className="query-field">
          <label htmlFor="location-name">Target Location Name</label>
          <input
            id="location-name"
            name="location-name"
            type="text"
            value={locationName}
            onChange={(event) => setLocationName(event.target.value)}
            placeholder="e.g. New Delhi, Kedarnath"
          />
        </div>

        <div className="query-field">
          <label htmlFor="language">Language</label>
          <select
            id="language"
            name="language"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            <option value="en">English</option>
            <option value="hi">Hindi (हिंदी)</option>
          </select>
        </div>

        <div className="query-field">
          <label htmlFor="latitude">Latitude (&deg;N)</label>
          <input
            id="latitude"
            name="latitude"
            type="number"
            step="any"
            value={latitude}
            onChange={(event) => setLatitude(event.target.value)}
            placeholder="e.g. 28.6139"
            required
          />
        </div>

        <div className="query-field">
          <label htmlFor="longitude">Longitude (&deg;E)</label>
          <input
            id="longitude"
            name="longitude"
            type="number"
            step="any"
            value={longitude}
            onChange={(event) => setLongitude(event.target.value)}
            placeholder="e.g. 77.2090"
            required
          />
        </div>

        {(mode === "vqa" || isFusion) && (
          <div className="query-field query-field--full">
            <label htmlFor="date">
              {isFusion
                ? "Optical & Radar Observation Date / Time"
                : "Sentinel-2 Observation Date"}
            </label>
            <input
              id="date"
              name="date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />
          </div>
        )}

        {isChangeDetection && (
          <>
            <div className="query-field">
              <label htmlFor="start-date">Baseline (Before) Date</label>
              <input
                id="start-date"
                name="start-date"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required
              />
            </div>

            <div className="query-field">
              <label htmlFor="end-date">Observation (After) Date</label>
              <input
                id="end-date"
                name="end-date"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                required
              />
            </div>
          </>
        )}

        <div className="query-form__footer">
          <p>
            {isFusion
              ? "Multimodal earth observation synthesizing ESA Sentinel-2 (optical) and Sentinel-1 (C-band SAR microwave radar)."
              : "Directly queries ESA Sentinel-2 MSI L2A surface reflectance imagery."}
          </p>

          <button
            type="submit"
            className="query-submit"
            disabled={isLoading || !query.trim()}
          >
            {isLoading
              ? "Retrieving & Analyzing..."
              : isFusion
                ? "Analyze Sensor Fusion"
                : mode === "change_detection"
                  ? "Detect Temporal Change"
                  : "Ask SatQuery"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default QueryPanel;