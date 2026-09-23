export const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL ||
  (location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8000"
    : "https://satquery.onrender.com")
).replace(/\/$/, "");
export const resolveImageUrl = (url) =>
  url?.startsWith("/") ? `${apiBaseUrl}${url}` : url;
export async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const data = await response.json();
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
  return (
    (await request(`/api/geocode?q=${encodeURIComponent(query)}`, { signal }))
      .results || []
  );
}
