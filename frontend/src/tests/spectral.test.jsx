// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import EvidenceViewer from "../components/EvidenceViewer";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("keeps spectral panels tied to the selected optical acquisition", () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const images = ["before", "after"].map((role, i) => ({ id: role, role, sensor: "sentinel-2", date: `202${i}-01-01`, width: 100, height: 100, usable_fraction: 1, url: `/${role}.png`, views: [{ kind: "ndvi", label: "Vegetation index (NDVI)", url: `/${role}-ndvi.png`, method: "Fixed scale", legend: ["Red: 0", "Green: 1"] }] }));
  render(<EvidenceViewer images={images} />);
  expect(screen.getByAltText("Vegetation index (NDVI), before, acquired 2020-01-01").getAttribute("src")).toBe("/before-ndvi.png");
  fireEvent.change(screen.getByLabelText("Optical observation"), { target: { value: "1" } });
  expect(screen.getByAltText("Vegetation index (NDVI), after, acquired 2021-01-01").getAttribute("src")).toBe("/after-ndvi.png");
  expect(screen.getByText("Red: 0 · Green: 1")).toBeTruthy();
});
