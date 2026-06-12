/**
 * Calculates the camera range needed for the presentation orbit so all gallery
 * points remain visible while the camera rotates around their bounding extent.
 */
export function presentationRange(
  bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  centerLat: number,
): number {
  const latSpanMeters = (bounds.maxLat - bounds.minLat) * 111320;
  const lonSpanMeters =
    (bounds.maxLon - bounds.minLon) *
    Math.max(111320 * Math.cos((centerLat * Math.PI) / 180), 1);
  return Math.max(1800, Math.max(latSpanMeters, lonSpanMeters) * 2.4);
}
