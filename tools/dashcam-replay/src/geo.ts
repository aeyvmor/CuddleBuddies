/** WGS84 helpers. Coordinates are [longitude, latitude] (GeoJSON order) unless named. */
export type LonLat = [number, number];

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: LonLat, b: LonLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Cumulative distance (m) at each vertex; first is 0. */
export function cumulativeDistances(route: LonLat[]): number[] {
  const out = [0];
  for (let i = 1; i < route.length; i++) out.push(out[i - 1]! + haversineM(route[i - 1]!, route[i]!));
  return out;
}

/** Point at distance `d` along the polyline (linear interpolation within a segment). */
export function pointAtDistance(route: LonLat[], cum: number[], d: number): LonLat {
  if (d <= 0) return route[0]!;
  const total = cum[cum.length - 1]!;
  if (d >= total) return route[route.length - 1]!;
  let i = 1;
  while (cum[i]! < d) i++;
  const seg = cum[i]! - cum[i - 1]!;
  const f = seg === 0 ? 0 : (d - cum[i - 1]!) / seg;
  const a = route[i - 1]!;
  const b = route[i]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}
