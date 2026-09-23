// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
const api = vi.hoisted(() => ({ fetchGeocodeSuggestions: vi.fn(), submitQuery: vi.fn() }));
vi.mock("../api/query", () => api);
import CropOutlook from "../components/CropOutlook";
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("defaults to automatic retrieval without a file upload", () => {
  const { container } = render(<CropOutlook />);
  expect(container.querySelector('input[type="file"]')).toBeNull();
  expect(screen.getByLabelText("Sowing date")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Retrieve crop data" }).disabled).toBe(true);
});
it("submits basic details, preserves zero coordinates and cancels stale results", async () => {
  api.fetchGeocodeSuggestions.mockResolvedValue([{ lat: 0, lon: 0, name: "Zero region" }]);
  let resolve;
  api.submitQuery.mockImplementation(() => new Promise(r => { resolve = r; }));
  const { container } = render(<CropOutlook />);
  fireEvent.change(screen.getByLabelText("Region or coordinates"), { target: { value: "0,0" } });
  fireEvent.click(screen.getByRole("button", { name: "Find region" }));
  fireEvent.click(await screen.findByRole("button", { name: "Zero region" }));
  fireEvent.change(screen.getByLabelText("Sowing date"), { target: { value: "2024-06-01" } });
  fireEvent.change(screen.getByLabelText("Observation cutoff"), { target: { value: "2024-09-01" } });
  fireEvent.submit(container.querySelector("form"));
  const [body, signal] = api.submitQuery.mock.calls[0];
  expect(body.mode).toBe("crop_auto");
  expect(body.location).toMatchObject({ lat: 0, lon: 0 });
  expect(body).not.toHaveProperty("historical");
  fireEvent.change(screen.getByLabelText("Crop"), { target: { value: "wheat" } });
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ status: "STALE AUTO" }));
  expect(screen.queryByText("Retrieved crop context")).toBeNull();
});
