import { it, expect } from "vitest";
import { gestureIntent } from "../gesture";
function palm(x, y = 0.8) {
  const h = Array.from({ length: 21 }, () => ({ x, y: y - 0.1 }));
  h[0] = { x, y };
  h[4] = { x: x - 0.15, y: y - 0.15 };
  for (const tip of [8, 12, 16, 20]) h[tip] = { x, y: y - 0.3 };
  return h;
}
function pinch(x, y) { const h = palm(x, y); h[4] = h[8]; return h; }
it("zooms in on spread, out on contraction, independent of hand ordering", () => {
  const a = gestureIntent([palm(0.3), palm(0.7)]);
  expect(a.zoom).toBe(0);
  expect(gestureIntent([palm(0.8), palm(0.2)], a).zoom).toBeLessThan(0);
  expect(gestureIntent([palm(0.4), palm(0.6)], a).zoom).toBeGreaterThan(0);
});
it("supports one-hand up/down zoom only in dedicated mode", () => {
  const settings = { mode: "zoom" };
  const a = gestureIntent([pinch(0.5, 0.7)], null, settings);
  expect(gestureIntent([pinch(0.5, 0.6)], a, settings).zoom).toBeLessThan(0);
  expect(gestureIntent([pinch(0.5, 0.8)], a, settings).zoom).toBeGreaterThan(0);
  expect(gestureIntent([pinch(0.5, 0.7)]).mode).toBe("orbit");
});
it("stops on hand loss and does not jump between zoom sources", () => {
  const a = gestureIntent([palm(0.3), palm(0.7)]);
  expect(gestureIntent([], a)).toEqual({ mode: null });
  expect(gestureIntent([pinch(0.5, 0.6)], a, { mode: "zoom" }).zoom).toBe(0);
  expect(gestureIntent([palm(0.3), palm(0.7)], null, { mode: "orbit" }).mode).toBeNull();
});
it("suppresses small jitter and bounds high sensitivity motion", () => {
  const a = gestureIntent([palm(0.3), palm(0.7)]);
  expect(gestureIntent([palm(0.301), palm(0.7)], a).zoom).toBe(0);
  expect(Math.abs(gestureIntent([palm(0.1), palm(0.9)], a, { sensitivity: 2 }).zoom)).toBeLessThanOrEqual(0.08);
});
