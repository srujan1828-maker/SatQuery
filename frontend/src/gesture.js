const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function gestureIntent(hands, previous) {
  const pinched = hands.filter(
    (h) =>
      dist(h[4], h[8]) / Math.max(dist(h[0], h[9]), 0.01) <
      (previous?.mode?.length ? 0.4 : 0.3),
  );
  if (!pinched.length) return { mode: null };
  if (pinched.length === 2) {
    const span = dist(pinched[0][0], pinched[1][0]);
    return {
      mode: "zoom",
      span,
      zoom:
        previous?.mode === "zoom"
          ? Math.max(-0.08, Math.min(0.08, (previous.span - span) * 2))
          : 0,
    };
  }
  const h = pinched[0][0];
  const dead = (n) =>
    Math.abs(n) < 0.003 ? 0 : Math.max(-0.03, Math.min(0.03, n));
  return {
    mode: "orbit",
    x: h.x,
    y: h.y,
    dx: previous?.mode === "orbit" ? dead(h.x - previous.x) : 0,
    dy: previous?.mode === "orbit" ? dead(h.y - previous.y) : 0,
  };
}
