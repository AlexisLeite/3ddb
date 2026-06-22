function rounded(value: number): string {
  return value.toFixed(7).replace(/0+$/, "").replace(/[.]$/, "");
}

/**
 * Builds a PostGIS WHERE condition that intersects 3DCityDB geometry with a
 * lon/lat bounding box centered on a tour point of interest.
 */
export function bboxWhereSql(latitude: number, longitude: number, radiusMeters: number): string {
  const latDelta = radiusMeters / 111320;
  const lonScale = Math.max(111320 * Math.cos((latitude * Math.PI) / 180), 1);
  const lonDelta = radiusMeters / lonScale;
  const west = rounded(longitude - lonDelta);
  const south = rounded(latitude - latDelta);
  const east = rounded(longitude + lonDelta);
  const north = rounded(latitude + latDelta);
  return `gd.geometry && ST_Transform(ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326), 2263)`;
}
