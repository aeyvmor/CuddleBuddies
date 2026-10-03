export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface Projected {
  /** 0..100, left to right */
  x: number;
  /** 0..100, top to bottom */
  y: number;
}

/**
 * Schematic equirectangular projection of points into a padded box. This is NOT
 * a basemap: the map provider is undecided and this keeps the component isolated.
 */
export function projectPoints(points: GeoPoint[], paddingPct = 10): Projected[] {
  if (points.length === 0) return [];
  const lats = points.map((p) => p.latitude);
  const lons = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const span = 100 - 2 * paddingPct;
  const scale = (v: number, min: number, max: number) =>
    max === min ? 50 : paddingPct + ((v - min) / (max - min)) * span;
  return points.map((p) => ({
    x: scale(p.longitude, minLon, maxLon),
    y: 100 - scale(p.latitude, minLat, maxLat),
  }));
}
