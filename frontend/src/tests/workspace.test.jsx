// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import EvidenceViewer from "../components/EvidenceViewer";
import { gestureIntent } from "../gesture";
import { boundsFor } from "../geo";
const api = vi.hoisted(() => ({
  submitQuery: vi.fn(),
  fetchGeocodeSuggestions: vi.fn(),
}));
vi.mock("../api/query", () => api);
vi.mock("../components/AreaMap", () => ({
  default: ({ lat, lon }) => (
    <div data-testid="coords">
      {lat},{lon}
    </div>
  ),
}));
import App from "../App";
beforeEach(() => {
  localStorage.clear();
  history.replaceState({}, "", "/?lat=0&lon=0");
  api.submitQuery.mockReset();
  globalThis.ResizeObserver = class {
    constructor(cb) {
      this.cb = cb;
    }
    observe() {
      this.cb([{ contentRect: { width: 1200 } }]);
    }
    disconnect() {}
  };
});
afterEach(cleanup);
const image = {
  id: "a",
  sha256: "hash",
  url: "/a.png",
  role: "single",
  sensor: "sentinel-2",
  date: "2024-05-12",
  requested_date: "2024-05-12",
  date_offset_days: 0,
  width: 512,
  height: 512,
  resolution_m: 10,
  usable_fraction: 0.8,
  scene_id: "scene",
  source_url: "https://example.test",
};
it("does not stretch a small raster to fill a larger container", () => {
  render(<EvidenceViewer images={[image]} />);
  expect(
    screen.getByAltText(/sentinel-2/).parentElement.parentElement.style.width,
  ).toBe("512px");
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  expect(screen.getByText(/Magnified beyond output pixels/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Reset / original" }));
  expect(
    screen.getByAltText(/sentinel-2/).parentElement.parentElement.style.width,
  ).toBe("512px");
});
it("keeps paired layers in one synchronized transform", () => {
  render(
    <EvidenceViewer images={[image, { ...image, id: "b", role: "after" }]} />,
  );
  const [a, b] = screen.getAllByRole("img");
  expect(a.parentElement.parentElement).toBe(b.parentElement.parentElement);
  fireEvent.change(screen.getByLabelText("Contrast"), {
    target: { value: "1.5" },
  });
  expect(a.style.filter).toBe(b.style.filter);
});
it("preserves zero coordinates", () => {
  render(<App />);
  expect(screen.getByTestId("coords").textContent).toBe("0,0");
});
it("ignores an old response after changing task", async () => {
  let resolve;
  api.submitQuery.mockImplementation(() => new Promise((r) => (resolve = r)));
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Retrieve and analyze" }));
  fireEvent.change(screen.getByLabelText("Task"), {
    target: { value: "fusion" },
  });
  await act(async () =>
    resolve({
      answer_text: "STALE RESULT",
      images: [],
      warnings: [],
      analysis_status: "partial",
    }),
  );
  expect(screen.queryByText("STALE RESULT")).toBeNull();
});
it("releases navigation immediately on hand loss and bounds jumps", () => {
  expect(gestureIntent([], { mode: "orbit", x: 0.2, y: 0.2 })).toEqual({
    mode: null,
  });
  const hand = Array.from({ length: 21 }, () => ({ x: 0.8, y: 0.8 }));
  hand[9] = { x: 0.8, y: 0.6 };
  const intent = gestureIntent([hand], { mode: "orbit", x: 0.1, y: 0.1 });
  expect(intent.dx).toBe(0.03);
  expect(intent.dy).toBe(0.03);
});
it("matches backend area calculation at zero", () => {
  const b = boundsFor(0, 0, 2.5);
  expect(b[0][0]).toBeCloseTo(-2.5 / 111.32);
  expect(b[1][1]).toBeCloseTo(2.5 / 111.32);
});
