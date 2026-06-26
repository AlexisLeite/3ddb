import type { Bounds } from "./Bounds.js";

/**
 * Describes the single connected 3DCityDB dataset used by the gallery app.
 */
export interface DatasetMetadata {
  label: string;
  detail: string;
  version: string;
  lod: string;
  verticalScale: number;
  imported: boolean;
  bounds: Bounds | null;
  stats: {
    features: number;
    buildings: number;
    lods: unknown[];
  };
}
