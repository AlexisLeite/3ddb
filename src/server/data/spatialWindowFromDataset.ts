import type { DatasetMetadata } from "../domain/DatasetMetadata.js";
import type { SpatialWindow } from "../domain/SpatialWindow.js";

/**
 * Computes the spatial query window that contains the connected 3DCityDB dataset.
 */
export function spatialWindowFromDataset(dataset: DatasetMetadata): SpatialWindow | null {
  const bounds = dataset.bounds;
  if (!bounds) return null;

  const lat = (bounds.minLat + bounds.maxLat) / 2;
  const latSpanMeters = (bounds.maxLat - bounds.minLat) * 111320;
  const lonSpanMeters =
    (bounds.maxLon - bounds.minLon) * Math.max(111320 * Math.cos((lat * Math.PI) / 180), 1);

  return {
    minLon: bounds.minLon,
    minLat: bounds.minLat,
    maxLon: bounds.maxLon,
    maxLat: bounds.maxLat,
    lon: (bounds.minLon + bounds.maxLon) / 2,
    lat,
    radiusMeters: Math.max(latSpanMeters, lonSpanMeters) / 2,
  };
}
