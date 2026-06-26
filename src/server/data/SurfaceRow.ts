/**
 * Describes one polygon row returned by the surface SQL query before it is
 * normalized into the domain Surface object consumed by tile generation.
 */
export interface SurfaceRow {
  geometry_id: number;
  feature_id: number;
  objectid: string;
  classname: string;
  lod: string;
  property_name: string;
  geojson: {
    type: string;
    coordinates: number[][][];
  };
}
