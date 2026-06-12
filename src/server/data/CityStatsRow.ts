/**
 * Represents the per-lineage feature count returned by the city statistics
 * query before the loader merges it into configured city part metadata.
 */
export interface CityStatsRow {
  id: string;
  features: number;
}
