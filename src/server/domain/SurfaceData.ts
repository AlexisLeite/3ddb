import type { DatasetMetadata } from "./DatasetMetadata.js";
import type { SpatialWindow } from "./SpatialWindow.js";
import type { Surface } from "./Surface.js";

/**
 * Groups loaded surfaces with dataset metadata and the spatial view that
 * produced them so tiling can build frame transforms and binary payloads.
 */
export interface SurfaceData {
  dataset: DatasetMetadata;
  view: SpatialWindow | null;
  surfaces: Surface[];
}
