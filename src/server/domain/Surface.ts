/**
 * Describes one polygon surface returned from 3DCityDB with feature identifiers
 * and GeoJSON rings ready for mesh generation.
 */
export interface Surface {
  partId: string;
  geometryId: number;
  featureId: number;
  objectId: string;
  className: string;
  lod: string;
  property: string;
  rings: number[][][];
  geojson: {
    type: string;
    coordinates: number[][][];
  };
}
