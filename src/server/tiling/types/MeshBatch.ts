/**
 * Describes one feature batch in a generated tile mesh so Cesium can expose
 * surface metadata through the 3D Tiles batch table.
 */
export interface MeshBatch {
  geometryId: number;
  featureId: number;
  objectId: string;
  className: string;
  lod: string;
  property: string;
  surfaceType: string;
}
