import vqaMock from "../../../mocks/vqa.json";
import changeDetectionMock from "../../../mocks/change-detection.json";
import fusionDemoMock from "../../../mocks/fusion-demo.json";

const mockResponses = {
  vqa: vqaMock,
  change_detection: changeDetectionMock,
  fusion_demo: fusionDemoMock,
};

/**
 * Submits a query to the SatQuery backend API or falls back to static mock data.
 *
 * @param {Object} requestBody - Contract B request object
 * @returns {Promise<Object>} Contract B response object
 */
export async function submitQuery(requestBody) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

  // If an explicit API URL is configured, attempt the live fetch
  if (apiBaseUrl) {
    try {
      const response = await fetch(`${apiBaseUrl}/api/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        return {
          mode: requestBody.mode || "vqa",
          answer_text: "System response error.",
          images: [],
          overlay_boxes: [],
          change_summary: null,
          confidence_flag: "uncertain",
          used_cache_fallback: false,
          error: {
            code: "http_error",
            message: `Server returned HTTP ${response.status}: ${response.statusText}`,
          },
        };
      }

      return await response.json();
    } catch (err) {
      return {
        mode: requestBody.mode || "vqa",
        answer_text: "Failed to connect to the backend service.",
        images: [],
        overlay_boxes: [],
        change_summary: null,
        confidence_flag: "uncertain",
        used_cache_fallback: false,
        error: {
          code: "network_error",
          message: err.message || "Network request failed.",
        },
      };
    }
  }

  // Fallback / mock behavior when no API base URL is configured
  await new Promise((resolve) => setTimeout(resolve, 600));

  const mode = requestBody.mode || "vqa";
  const mockData = mockResponses[mode] || mockResponses.vqa;

  return mockData;
}
