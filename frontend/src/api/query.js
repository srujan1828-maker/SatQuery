const isLocalhost = typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
const DEFAULT_API_BASE_URL = isLocalhost ? "http://127.0.0.1:8000" : "https://satquery.onrender.com";

/**
 * Base URL for requests made by the browser. Vite replaces this expression at
 * build time, so set VITE_API_BASE_URL in Vercel before deploying.
 */
export const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/$/, "");

/**
 * Resolves an image URL returned by the backend.
 * Relative URLs are resolved against the backend so image requests go directly
 * to the same service as the query request.
 *
 * @param {string} url - Image URL from Contract B response
 * @returns {string} Fully resolved image URL
 */
export function resolveImageUrl(url) {
  if (!url) return "";

  // If already absolute (http/https) or data URL, return as-is
  if (/^(https?:|\/\/|data:)/i.test(url)) {
    return url;
  }

  const cleanUrl = url.startsWith("/") ? url : `/${url}`;
  return `${apiBaseUrl}${cleanUrl}`;
}

/**
 * Submits a Contract B query payload to the real SatQuery backend endpoint.
 *
 * @param {Object} requestBody - Contract B request object
 * @returns {Promise<Object>} Contract B response object
 */
export async function submitQuery(requestBody) {
  try {
    // Deliberately call the configured backend directly rather than a Vercel
    // rewrite. VITE_API_BASE_URL is embedded in the production bundle.
    const response = await fetch(`${apiBaseUrl}/api/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let errorMessage = `Server returned HTTP ${response.status}: ${response.statusText}`;
      let errorCode = "http_error";

      try {
        const errorJson = await response.json();
        if (errorJson?.error?.message) {
          errorMessage = errorJson.error.message;
        }
        if (errorJson?.error?.code) {
          errorCode = errorJson.error.code;
        }
      } catch {
        // Response body was not JSON
      }

      return {
        mode: requestBody.mode || "vqa",
        answer_text: "The satellite intelligence service returned an error.",
        images: [],
        overlay_boxes: [],
        change_summary: null,
        confidence_flag: "uncertain",
        used_cache_fallback: false,
        error: {
          code: errorCode,
          message: errorMessage,
        },
      };
    }

    const data = await response.json();

    if (Array.isArray(data.images)) {
      data.images = data.images.map((image) => ({
        ...image,
        url: resolveImageUrl(image.url),
      }));
    }

    return data;
  } catch (err) {
    return {
      mode: requestBody.mode || "vqa",
      answer_text:
        "The imagery model or backend service is temporarily unavailable.",
      images: [],
      overlay_boxes: [],
      change_summary: null,
      confidence_flag: "uncertain",
      used_cache_fallback: false,
      error: {
        code: "geochat_unreachable",
        message:
          err.message ||
          "Unable to connect to the backend service. Check network connectivity or server status.",
      },
    };
  }
}
