/**
 * Describes a geographic rectangle in degrees for framing groups of gallery
 * points without coupling camera code to Cesium rectangle instances.
 */
export interface Bounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}
