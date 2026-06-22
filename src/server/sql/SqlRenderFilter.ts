/**
 * Describes the validated database identifiers that a SQL query can use to
 * constrain dynamic 3D tile surface loading without re-injecting raw SQL.
 */
export interface SqlRenderFilter {
  kind: "featureIds" | "geometryIds";
  ids: string[];
}
