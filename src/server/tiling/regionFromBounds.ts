import type { ServerConfig } from "../config/ServerConfig.js";
import type { Bounds } from "../domain/Bounds.js";

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

/**
 * Converts geographic bounds into the 3D Tiles region array format using the
 * configured vertical scale and optional dataset height offset.
 */
export function regionFromBounds(
  bounds: Bounds,
  config: ServerConfig,
  verticalOffsetMeters = 0,
): number[] {
  const minHeight = Number.isFinite(bounds.minZ)
    ? Number(bounds.minZ) * config.nyc.verticalScale + verticalOffsetMeters
    : 0;
  const maxHeight = Number.isFinite(bounds.maxZ)
    ? Number(bounds.maxZ) * config.nyc.verticalScale + verticalOffsetMeters
    : minHeight + 1;

  return [
    degreesToRadians(bounds.minLon),
    degreesToRadians(bounds.minLat),
    degreesToRadians(bounds.maxLon),
    degreesToRadians(bounds.maxLat),
    minHeight,
    Math.max(maxHeight, minHeight + 1),
  ];
}
