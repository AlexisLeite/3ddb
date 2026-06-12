import type { Bounds } from "../domain/Bounds.js";
import type { CityPart } from "../domain/CityPart.js";
import type { SpatialWindow } from "../domain/SpatialWindow.js";

/**
 * Computes the spatial query window that contains imported city parts, using
 * their union bounds and an approximate radius in meters for query limiting.
 */
export function spatialWindowFromParts(parts: CityPart[]): SpatialWindow | null {
  const bounds = parts.map((part) => part.bounds).filter((bounds): bounds is Bounds => Boolean(bounds));
  if (bounds.length === 0) return null;

  const union = bounds.reduce(
    (acc, item) => ({
      minLon: Math.min(acc.minLon, item.minLon),
      minLat: Math.min(acc.minLat, item.minLat),
      maxLon: Math.max(acc.maxLon, item.maxLon),
      maxLat: Math.max(acc.maxLat, item.maxLat),
    }),
    {
      minLon: Infinity,
      minLat: Infinity,
      maxLon: -Infinity,
      maxLat: -Infinity,
    },
  );
  const lat = (union.minLat + union.maxLat) / 2;
  const latSpanMeters = (union.maxLat - union.minLat) * 111320;
  const lonSpanMeters =
    (union.maxLon - union.minLon) * Math.max(111320 * Math.cos((lat * Math.PI) / 180), 1);

  return {
    ...union,
    lon: (union.minLon + union.maxLon) / 2,
    lat,
    radiusMeters: Math.max(latSpanMeters, lonSpanMeters) / 2,
  };
}
