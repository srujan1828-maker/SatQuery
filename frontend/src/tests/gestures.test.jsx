// @vitest-environment jsdom
import { it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, screen, waitFor, cleanup } from "@testing-library/react";
import GestureControl from "../components/GestureControl";
const { create, detect, close } = vi.hoisted(() => ({ create: vi.fn(), detect: vi.fn(() => ({ landmarks: [] })), close: vi.fn() }));
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
  HandLandmarker: { createFromOptions: create },
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
function setup() {
  const stop = vi.fn();
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] })) } });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() });
  create.mockResolvedValue({ detectForVideo: detect, close });
  return stop;
}
it("starts browser CPU tracking and closes model/camera on Escape", async () => {
  const stop = setup();
  render(<GestureControl onIntent={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /Enable gesture|Stop camera/ }));
  await screen.findByText(/Ready — open hand/);
  expect(create.mock.calls[0][1]).toMatchObject({ baseOptions: { delegate: "CPU" }, numHands: 2 });
  fireEvent.keyDown(window, { key: "Escape" });
  expect(stop).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  expect(screen.getByRole("status").textContent).toBe("Off");
});
it("releases a model that finishes loading after the user stops", async () => {
  setup();
  let resolve;
  create.mockImplementation(() => new Promise(r => { resolve = r; }));
  render(<GestureControl onIntent={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /Enable gesture|Stop camera/ }));
  await waitFor(() => expect(create).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: /Enable gesture|Stop camera/ }));
  resolve({ close, detectForVideo: detect });
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(detect).not.toHaveBeenCalled();
});
it("explains insecure camera contexts without starting a model", () => {
  vi.stubGlobal("isSecureContext", false);
  render(<GestureControl onIntent={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /Enable gesture|Stop camera/ }));
  expect(screen.getByRole("status").textContent).toContain("HTTPS");
  expect(create).not.toHaveBeenCalled();
});
