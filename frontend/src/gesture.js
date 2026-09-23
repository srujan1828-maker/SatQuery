const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n, limit) => Math.max(-limit, Math.min(limit, n));
const dead = (n) => Math.abs(n) < 0.003 ? 0 : clamp(n, 0.03);
const openPalm = (h) => [8, 12, 16, 20].every((tip) =>
  dist(h[tip], h[0]) > dist(h[tip - 2], h[0]) * 1.25);

export function gestureIntent(hands, previous, { mode = "auto", sensitivity = 1 } = {}) {
  const valid = hands.filter(h => h?.length === 21 && h.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  const pinched = valid.filter(h => dist(h[4], h[8]) / Math.max(dist(h[0], h[9]), 0.01) < (previous?.mode ? 0.4 : 0.3));
  const palms = valid.filter(openPalm);
  const pair = palms.length === 2 ? palms : pinched.length === 2 ? pinched : null;
  const gain = Math.max(0.5, Math.min(2, sensitivity));
  if (mode !== "orbit" && pair) {
    const span = dist(pair[0][0], pair[1][0]);
    const source = palms.length === 2 ? "palms" : "pinches";
    const delta = previous?.mode === "zoom" && previous.source === source ? previous.span - span : 0;
    return { mode: "zoom", source, span, zoom: Math.abs(delta) < 0.004 ? 0 : clamp(delta * 2 * gain, 0.08) };
  }
  // In dedicated Zoom mode, one pinched hand acts as a vertical zoom slider.
  if (mode === "zoom" && pinched.length === 1) {
    const y = pinched[0][0].y;
    return { mode: "zoom", source: "single", y,
      zoom: previous?.source === "single" ? clamp(dead(y - previous.y) * 3 * gain, 0.08) : 0 };
  }
  if (mode === "zoom" || pinched.length !== 1) return { mode: null };
  const h = pinched[0][0];
  return { mode: "orbit", x: h.x, y: h.y,
    dx: previous?.mode === "orbit" ? dead(h.x - previous.x) : 0,
    dy: previous?.mode === "orbit" ? dead(h.y - previous.y) : 0 };
}
