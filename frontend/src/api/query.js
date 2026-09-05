/**
 * Resolves an image URL returned by the backend.
 * Relative URLs remain same-origin so Vercel can proxy them to the backend.
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

  return cleanUrl;
}

/**
 * Submits a Contract B query payload to the real SatQuery backend endpoint.
 *
 * @param {Object} requestBody - Contract B request object
 * @returns {Promise<Object>} Contract B response object
 */
export async function submitQuery(requestBody) {
  try {
    // Always use the same-origin proxy. A VITE_API_BASE_URL value configured
    // in Vercel is compiled into the client and would otherwise bypass this
    // proxy, causing the direct cross-origin request shown in DevTools.
    const response = await fetch("/api/query", {
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

    // Keep relative satellite image URLs same-origin so /media is proxied too.
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
