import type { Bounds } from "../../domain/Bounds.js";

/**
 * Describes a generated child tile identifier and its geographic bounds within
 * a configured NYC delivery area tile grid.
 */
export interface TileBounds {
  id: string;
  bounds: Bounds;
}
