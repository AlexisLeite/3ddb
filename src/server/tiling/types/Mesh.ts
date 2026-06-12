import type { MeshBatch } from "./MeshBatch.js";

/**
 * Describes the vertex buffers, line buffers and batch metadata required to
 * serialize a generated surface mesh into a b3dm tile.
 */
export interface Mesh {
  vertices: number[];
  normals: number[];
  colors: number[];
  batchIds: number[];
  lineVertices: number[];
  lineColors: number[];
  lineBatchIds: number[];
  batches: MeshBatch[];
  skipped: number;
  vertexCount: number;
  lineVertexCount: number;
}
