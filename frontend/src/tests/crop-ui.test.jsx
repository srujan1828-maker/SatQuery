// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import CropOutlook from "../components/CropOutlook";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../api/query", () => ({ request }));
afterEach(() => { cleanup(); request.mockReset(); });
it("requires measured data and rejects malformed uploads", async () => {
  render(<CropOutlook />);
  expect(screen.getByRole("button", { name: "Evaluate model and estimate yield" }).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Historical records (.json)"), { target: { files: [{ name: "bad.json", size: 3, text: async () => "{}" }] } });
  await screen.findByRole("alert");
  expect(request).not.toHaveBeenCalled();
});
it("discards an in-flight crop response when inputs change", async () => {
  let resolve;
  request.mockImplementation(() => new Promise(r => { resolve = r; }));
  const { container } = render(<CropOutlook />);
  fireEvent.change(screen.getByLabelText("Historical records (.json)"), { target: { files: [{ name: "fixtures.json", size: 100, text: async () => JSON.stringify(Array(40).fill({ district: "test" })) }] } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Evaluate model and estimate yield" }).disabled).toBe(false));
  // Bypass native form validation to exercise stale-result cancellation only.
  fireEvent.submit(container.querySelector("form"));
  await waitFor(() => expect(request).toHaveBeenCalled());
  const signal = request.mock.calls[0][1].signal;
  fireEvent.change(screen.getByLabelText("District"), { target: { value: "changed" } });
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ status: "withheld", withheld_reasons: ["STALE CROP RESULT"] }));
  expect(screen.queryByText("STALE CROP RESULT")).toBeNull();
});
