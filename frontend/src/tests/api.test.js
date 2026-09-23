// @vitest-environment jsdom
import { it, expect, vi, afterEach } from "vitest";
import { fetchGeocodeSuggestions, submitQuery, request } from "../api/query";
afterEach(() => vi.unstubAllGlobals());
it("uses backend geocode results without external fallback", async () => {
  const fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ results: [{ name: "Zero", lat: 0, lon: 0 }] }),
  }));
  vi.stubGlobal("fetch", fetch);
  expect(await fetchGeocodeSuggestions("Zero")).toHaveLength(1);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("shows backend field validation details", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      json: async () => ({
        detail: [{ loc: ["body", "date"], msg: "future date" }],
      }),
    })),
  );
  await expect(request("/test")).rejects.toThrow("date: future date");
});
it("resolves a completed job and evidence URLs", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "test-job" }) })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "succeeded",
        result: { images: [{ url: "/media/artifacts/test.png" }] },
        created_at: "2026-01-01",
      }),
    });
  vi.stubGlobal("fetch", fetch);
  const result = await submitQuery({}, new AbortController().signal);
  expect(result.run_id).toBe("test-job");
  expect(result.images[0].url).toContain("/media/artifacts/test.png");
});
