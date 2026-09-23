const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n, limit) => Math.max(-limit, Math.min(limit, n));
const dead = (n) => Math.abs(n) < 0.003 ? 0 : clamp(n, 0.03);
const openPalm = (h) => [8, 12, 16, 20].every((tip) =>
  dist(h[tip], h[0]) > dist(h[tip - 2], h[0]) * 1.25);

export function gestureIntent(hands, previous, { mode = "auto", sensitivity = 1 } = {}) {
  const valid = hands.filter(h => h?.length === 21 && h.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  const pinched = valid.filter(h => dist(h[4], h[8]) / Math.max(dist(h[0], h[9]), 0.01) < (previous?.mode ? 0.4 : 0.3));
  const palms = valid.filter(openPalm);
  // Easy mode uses one hand and separates rotation from zoom by hand pose.
  // Require three extended fingers, so the thumb can rest naturally.
  if (mode === "easy") {
    if (valid.length !== 1) return { mode: null };
    const h = valid[0];
    const source = pinched.length ? "pinch" : [8, 12, 16, 20].filter(tip =>
      dist(h[tip], h[0]) > dist(h[tip - 2], h[0]) * 1.2).length >= 3 ? "palm" : null;
    if (!source) return { mode: null };
    const same = previous?.source === source;
    const x = same ? previous.x + (h[0].x - previous.x) * 0.55 : h[0].x;
    const y = same ? previous.y + (h[0].y - previous.y) * 0.55 : h[0].y;
    // Tracking jumps or a newly acquired hand establish a new anchor.
    if (same && dist(h[0], previous) > 0.2) return { mode: null };
    return source === "pinch"
      ? { mode: "zoom", source, x, y, zoom: same ? clamp(dead(y - previous.y) * 3 * sensitivity, 0.06) : 0 }
      : { mode: "orbit", source, x, y, dx: same ? dead(x - previous.x) : 0, dy: same ? dead(y - previous.y) : 0 };
  }
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

// Leave a CPU budget for Cesium; idle tracking only needs to notice a hand.
export function trackingDelay(inferenceMs, moving) {
  return Math.max(moving ? 83 : 200, inferenceMs * 2);
}
