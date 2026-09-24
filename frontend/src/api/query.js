// Vercel proxies the known Render API so browser requests stay same-origin.
export function selectApiBase(configured, hostname) {
  const value = (configured || "").trim().replace(/\/$/, "");
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  if (local) return value || "http://127.0.0.1:8000";
  if (!value || value === "https://satquery.onrender.com") return "";
  return value; // Custom backends still need their own CORS configuration.
}
export const apiBaseUrl = selectApiBase(import.meta.env.VITE_API_BASE_URL, location.hostname);
export const resolveImageUrl = (url) =>
  url?.startsWith("/") ? `${apiBaseUrl}${url}` : url;
export async function request(path, options = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; abort(); }, 30000);
  let response, data;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, { ...options, signal: controller.signal });
    try { data = await response.json(); }
    catch { throw new Error(`The server returned an unreadable response (${response.status}). It may still be starting. Please retry.`); }
  } catch (error) {
    if (timedOut) throw new Error("The server took too long to respond. Wait a moment and retry.");
    if (error.name === "AbortError") throw error;
    if (error instanceof TypeError) throw new Error("Cannot reach the SatQuery server. It may be starting or temporarily unavailable. Please retry.");
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
  if (!response.ok) {
    const detail = data.detail;
    throw new Error(
      Array.isArray(detail)
        ? detail.map((e) => `${e.loc.slice(1).join(".")}: ${e.msg}`).join("; ")
        : detail || "Service unavailable",
    );
  }
  return data;
}
export async function submitQuery(body, signal, progress) {
  const job = await request("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const cancel = () => {
    fetch(`${apiBaseUrl}/api/jobs/${job.id}`, {
      method: "DELETE",
      keepalive: true,
    }).catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) {
      cancel();
      throw new DOMException("Cancelled", "AbortError");
    }
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline) {
      const state = await request(`/api/jobs/${job.id}`, { signal });
      progress?.(state.message);
      if (state.status === "succeeded") {
        const result = state.result;
        result.images = result.images.map((i) => ({
          ...i,
          url: resolveImageUrl(i.url),
        }));
        return { ...result, run_id: job.id, created_at: state.created_at };
      }
      if (["failed", "cancelled"].includes(state.status))
        throw new Error(state.message);
      await new Promise((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timer);
          reject(new DOMException("Cancelled", "AbortError"));
        };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        }, 1200);
        signal.addEventListener("abort", onAbort, { once: true });
      });
    }
    cancel();
    throw new Error("The analysis deadline was reached. Please retry.");
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
export async function fetchGeocodeSuggestions(query, signal) {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  const match = query.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*[, ]\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/);
  if (match) {
    const lat = Number(match[1]), lon = Number(match[2]);
    if (Math.abs(lat) > 80 || Math.abs(lon) > 180) throw new Error("Use latitude between -80 and 80, and longitude between -180 and 180.");
    return [{ name: `Coordinates (${lat}, ${lon})`, display_name: `Latitude ${lat}, longitude ${lon}`, lat, lon }];
  }
  return (
    (await request(`/api/geocode?q=${encodeURIComponent(query)}`, { signal }))
      .results || []
  );
}
