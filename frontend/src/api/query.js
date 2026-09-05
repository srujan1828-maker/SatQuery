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

/**
 * Autocomplete and geocode locations for interactive geospatial map.
 * Queries /api/geocode on the backend with fallback to OpenStreetMap Nominatim.
 *
 * @param {string} query - Location name, address, or coordinates
 * @returns {Promise<Array>} List of location candidates
 */
export async function fetchGeocodeSuggestions(query) {
  if (!query || !query.trim()) return [];
  const cleanQ = query.trim();

  // Try backend geocode endpoint first
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/geocode?q=${encodeURIComponent(cleanQ)}`,
      {
        headers: {
          "Accept": "application/json",
        },
      }
    );
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.results) && data.results.length > 0) {
        return data.results;
      }
    }
  } catch {
    // Backend endpoint unavailable, fall through to direct Nominatim lookup
  }

  // Fallback: direct Nominatim lookup from browser
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQ)}&limit=5&addressdetails=1`,
      {
        headers: {
          "Accept-Language": "en",
        },
      }
    );
    if (resp.ok) {
      const results = await resp.json();
      return results.map((item) => ({
        name: item.name || item.display_name.split(",")[0],
        display_name: item.display_name,
        lat: parseFloat(parseFloat(item.lat).toFixed(4)),
        lon: parseFloat(parseFloat(item.lon).toFixed(4)),
        category: (item.type || "Location").replace("_", " "),
      }));
    }
  } catch {
    // Both failed
  }

  return [];
}
