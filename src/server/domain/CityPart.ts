import type { Bounds } from "./Bounds.js";

/**
 * Describes a configured NYC delivery area, including import status, bounds and
 * lightweight statistics returned to the client.
 */
export interface CityPart {
  id: string;
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
