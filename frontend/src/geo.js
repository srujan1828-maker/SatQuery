export function boundsFor(lat, lon, radius) {
  const dy = radius / 111.32,
    dx = dy / Math.cos((lat * Math.PI) / 180);
  return [
    [lat - dy, lon - dx],
    [lat + dy, lon + dx],
  ];
}
