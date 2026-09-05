import { useState } from "react";

import { submitQuery } from "../api/query.js";

import "./QueryPanel.css";

const modeLabels = {
  vqa: "Visual Question Answering",
  change_detection: "Change Detection",
  fusion_demo: "Fusion Demo",
};

function QueryPanel({ mode, onResult, onLoadingChange }) {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("en");
  const [locationName, setLocationName] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [date, setDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const isFusion = mode === "fusion_demo";
  const isChangeDetection = mode === "change_detection";

  const buildRequestBody = () => {
    const body = {
      query: query.trim(),
      language,
      mode,
    };

    if (!isFusion) {
      body.location = {
        lat: Number(latitude),
        lon: Number(longitude),
      };

      if (locationName.trim()) {
        body.location.name = locationName.trim();
      }
    }

    if (mode === "vqa") {
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

    if (!isFusion && (!latitude || !longitude)) {
      return;
    }

    if (mode === "vqa" && !date) {
      return;
    }

    if (
      isChangeDetection &&
      (!startDate || !endDate)
    ) {
      return;
    }

    const requestBody = buildRequestBody();

    console.log("Contract B request:", requestBody);

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
          <p className="eyebrow">QUERY</p>

          <h2>{modeLabels[mode]}</h2>
        </div>

        <span className="query-panel__mode">
          {mode}
        </span>
      </div>

      <form
        className="query-form"
        onSubmit={handleSubmit}
      >
        <div className="query-field query-field--full">
          <label htmlFor="query">
            What do you want to know?
          </label>

          <textarea
            id="query"
            name="query"
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder={
              mode === "vqa"
                ? "Ask a question about the satellite image..."
                : mode === "change_detection"
                  ? "Ask what changed between the two dates..."
                  : "Describe what you want to compare using optical and radar observations..."
            }
            rows={4}
          />
        </div>

        {!isFusion && (
          <>
            <div className="query-field">
              <label htmlFor="location-name">
                Location name
              </label>

              <input
                id="location-name"
                name="location-name"
                type="text"
                value={locationName}
                onChange={(event) =>
                  setLocationName(event.target.value)
                }
                placeholder="Optional"
              />
            </div>

            <div className="query-field">
              <label htmlFor="language">
                Language
              </label>

              <select
                id="language"
                name="language"
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value)
                }
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
              </select>
            </div>

            <div className="query-field">
              <label htmlFor="latitude">
                Latitude
              </label>

              <input
                id="latitude"
                name="latitude"
                type="number"
                step="any"
                value={latitude}
                onChange={(event) =>
                  setLatitude(event.target.value)
                }
                placeholder="e.g. 28.6139"
              />
            </div>

            <div className="query-field">
              <label htmlFor="longitude">
                Longitude
              </label>

              <input
                id="longitude"
                name="longitude"
                type="number"
                step="any"
                value={longitude}
                onChange={(event) =>
                  setLongitude(event.target.value)
                }
                placeholder="e.g. 77.2090"
              />
            </div>

            {mode === "vqa" && (
              <div className="query-field">
                <label htmlFor="date">
                  Observation date
                </label>

                <input
                  id="date"
                  name="date"
                  type="date"
                  value={date}
                  onChange={(event) =>
                    setDate(event.target.value)
                  }
                />
              </div>
            )}

            {isChangeDetection && (
              <>
                <div className="query-field">
                  <label htmlFor="start-date">
                    Start date
                  </label>

                  <input
                    id="start-date"
                    name="start-date"
                    type="date"
                    value={startDate}
                    onChange={(event) =>
                      setStartDate(event.target.value)
                    }
                  />
                </div>

                <div className="query-field">
                  <label htmlFor="end-date">
                    End date
                  </label>

                  <input
                    id="end-date"
                    name="end-date"
                    type="date"
                    value={endDate}
                    onChange={(event) =>
                      setEndDate(event.target.value)
                    }
                  />
                </div>
              </>
            )}
          </>
        )}

        <div className="query-form__footer">
          <p>
            {isFusion
              ? "Uses the prepared fusion demonstration."
              : "Your request follows the SatQuery query contract."}
          </p>

          <button
            type="submit"
            className="query-submit"
          >
            {isFusion
              ? "Run Fusion Demo"
              : mode === "change_detection"
                ? "Detect Change"
                : "Ask SatQuery"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default QueryPanel;