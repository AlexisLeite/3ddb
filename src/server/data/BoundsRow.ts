import type { Bounds } from "../domain/Bounds.js";

/**
 * Extends geographic part bounds with the lineage identifier returned by the
 * database bounds query so rows can be indexed by configured city part id.
 */
export interface BoundsRow extends Bounds {
  id: string;
}
