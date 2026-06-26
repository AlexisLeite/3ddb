import type { Bounds } from "../../domain/Bounds.js";

/**
 * Describes a generated child tile identifier and its geographic bounds within
 * the connected dataset tile grid.
 */
export interface TileBounds {
  id: string;
  bounds: Bounds;
}
