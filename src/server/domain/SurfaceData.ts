import type { CityPart } from "./CityPart.js";
import type { SpatialWindow } from "./SpatialWindow.js";
import type { Surface } from "./Surface.js";

/**
 * Groups loaded surfaces with the imported parts and spatial view that produced
 * them so tiling can build frame transforms and binary payloads.
 */
export interface SurfaceData {
  partIds: string[];
  parts: CityPart[];
  view: SpatialWindow | null;
  surfaces: Surface[];
}
