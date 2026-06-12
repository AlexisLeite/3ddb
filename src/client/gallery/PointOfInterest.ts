/**
 * Defines the normalized point of interest consumed by the gallery UI and
 * Cesium integration, independent from the raw JSON or GeoJSON source shape.
 */
export interface PointOfInterest {
  id: string;
  name: string;
  imageUrl: string;
  imageUrls: string[];
  latitude: number;
  longitude: number;
  address: string;
  summary: string;
}
