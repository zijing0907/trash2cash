/** "4.3375, 101.1436" (as Google Maps and OpenStreetMap copy it) -> [lat, lng], or null if it is not a position */
export function parseCoords(text: string): [number, number] | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}

export type LatLng = [lat: number, lng: number];

/** Straight-line distance in km (haversine), the same sum the API's route uses */
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Visiting order: always the nearest place not yet visited, starting from `start` (or the first place). */
export function nearestFirst<T extends { at: LatLng }>(places: T[], start?: LatLng | null): T[] {
  const left = [...places];
  const order: T[] = [];
  let here = start ?? left[0]?.at;
  while (left.length && here) {
    let best = 0;
    left.forEach((p, i) => {
      if (distanceKm(here!, p.at) < distanceKm(here!, left[best]!.at)) best = i;
    });
    const [next] = left.splice(best, 1);
    order.push(next!);
    here = next!.at;
  }
  return order;
}
