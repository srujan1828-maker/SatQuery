// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
vi.mock("../App", () => ({ default: ({ mode, title }) => <h1>{title}: {mode}</h1> }));
vi.mock("../components/CropOutlook", () => ({ default: () => <h1>Crop Outlook workspace</h1> }));
import Pages from "../pages";
afterEach(() => { cleanup(); history.replaceState({}, "", "/"); });
it("provides four linked subpages and supports browser back", async () => {
  history.replaceState({}, "", "/ask?lat=0&lon=0");
  render(<Pages />);
  expect(screen.getByRole("heading").textContent).toContain("vqa");
  fireEvent.click(screen.getByRole("link", { name: "Water Change" }));
  expect(location.pathname).toBe("/water-change");
  expect(location.search).toContain("lat=0");
  expect(screen.getByRole("heading").textContent).toContain("change_detection");
  fireEvent.click(screen.getByRole("link", { name: "Optical & Radar" }));
  expect(screen.getByRole("heading").textContent).toContain("fusion");
  fireEvent.click(screen.getByRole("link", { name: "Crop Outlook" }));
  await screen.findByRole("heading", { name: "Crop Outlook workspace" });
  history.replaceState({}, "", "/ask");
  fireEvent.popState(window);
  expect(screen.getByRole("heading").textContent).toContain("vqa");
});
it("opens deep links with the correct task", () => {
  history.replaceState({}, "", "/water-change");
  render(<Pages />);
  expect(screen.getByRole("link", { name: "Water Change" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("heading").textContent).toContain("change_detection");
});
