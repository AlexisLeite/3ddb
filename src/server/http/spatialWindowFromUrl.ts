import type { SpatialWindow } from "../domain/SpatialWindow.js";

function numberParam(url: URL, name: string): number | null {
  if (!url.searchParams.has(name)) return null;
  const value = Number(url.searchParams.get(name));
  return Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Parses bounding-box or radius query parameters into the spatial window used
 * to constrain database geometry queries for dynamic tiles.
 */
export function spatialWindowFromUrl(
  url: URL,
  minRadiusMeters: number,
  maxRadiusMeters: number,
): SpatialWindow | null {
  const bboxParamNames = ["minLon", "minLat", "maxLon", "maxLat"];
  const hasBboxParams = bboxParamNames.some((name) => url.searchParams.has(name));
  if (hasBboxParams) {
    const minLon = numberParam(url, "minLon");
    const minLat = numberParam(url, "minLat");
    const maxLon = numberParam(url, "maxLon");
    const maxLat = numberParam(url, "maxLat");
    if ([minLon, minLat, maxLon, maxLat].some((value) => value === null)) return null;

    const west = clamp(Math.min(minLon as number, maxLon as number), -180, 180);
    const south = clamp(Math.min(minLat as number, maxLat as number), -90, 90);
    const east = clamp(Math.max(minLon as number, maxLon as number), -180, 180);
    const north = clamp(Math.max(minLat as number, maxLat as number), -90, 90);
    if (west === east || south === north) return null;

    return {
      lon: (west + east) / 2,
      lat: (south + north) / 2,
      radiusMeters: 0,
      minLon: west,
      minLat: south,
      maxLon: east,
      maxLat: north,
    };
  }

  const lon = numberParam(url, "lon");
  const lat = numberParam(url, "lat");
  const requestedRadius = numberParam(url, "radius");
  if (lon === null || lat === null || requestedRadius === null) return null;

  const radiusMeters = clamp(requestedRadius, minRadiusMeters, maxRadiusMeters);
  const latDelta = radiusMeters / 111320;
  const lonDelta = radiusMeters / Math.max(111320 * Math.cos((lat * Math.PI) / 180), 1);
  return {
    lon,
    lat,
    radiusMeters,
    minLon: lon - lonDelta,
    minLat: lat - latDelta,
    maxLon: lon + lonDelta,
    maxLat: lat + latDelta,
  };
}
