import type { Bounds } from "./Bounds.js";

/**
 * Describes the geographic window requested by a tile or API call, including
 * the center point and radius used for radius-based queries.
 */
export interface SpatialWindow extends Bounds {
  lon: number;
  lat: number;
  radiusMeters: number;
}
