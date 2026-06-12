/**
 * Describes a geographic bounding box using longitude, latitude and optional
 * vertical height values from the imported 3DCityDB geometry metadata.
 */
export interface Bounds {
  minLon: number;
  minLat: number;
  minZ?: number;
  maxLon: number;
  maxLat: number;
  maxZ?: number;
}
