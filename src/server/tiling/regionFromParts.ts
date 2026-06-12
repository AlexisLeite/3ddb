import type { ServerConfig } from "../config/ServerConfig.js";
import type { Bounds } from "../domain/Bounds.js";
import type { CityPart } from "../domain/CityPart.js";
import { partVerticalOffsetMeters } from "./partVerticalOffsetMeters.js";

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function unionBounds(parts: CityPart[]): Bounds | null {
  const bounds = parts
    .map((part) => part.bounds)
    .filter((partBounds): partBounds is Bounds => Boolean(partBounds))
    .reduce(
      (acc, partBounds) => ({
        minLon: Math.min(acc.minLon, partBounds.minLon),
        minLat: Math.min(acc.minLat, partBounds.minLat),
        minZ: Math.min(acc.minZ ?? Infinity, Number(partBounds.minZ || 0)),
        maxLon: Math.max(acc.maxLon, partBounds.maxLon),
        maxLat: Math.max(acc.maxLat, partBounds.maxLat),
        maxZ: Math.max(acc.maxZ ?? -Infinity, Number(partBounds.maxZ || 0)),
      }),
      {
        minLon: Infinity,
        minLat: Infinity,
        minZ: Infinity,
        maxLon: -Infinity,
        maxLat: -Infinity,
        maxZ: -Infinity,
      } as Bounds,
    );

  return Number.isFinite(bounds.minLon) ? bounds : null;
}

/**
 * Creates a root 3D Tiles region from all imported city parts while preserving
 * per-part relative height offsets in the aggregate height range.
 */
export function regionFromParts(parts: CityPart[], config: ServerConfig): number[] | null {
  const bounds = unionBounds(parts);
  if (!bounds) return null;

  const heightRanges = parts
    .filter((part) => part.bounds)
    .map((part) => {
      const verticalOffsetMeters = partVerticalOffsetMeters(part, config);
      return {
        minHeight: Number(part.bounds?.minZ || 0) * config.nyc.verticalScale + verticalOffsetMeters,
        maxHeight: Number(part.bounds?.maxZ || 0) * config.nyc.verticalScale + verticalOffsetMeters,
      };
    });

  const minHeight = Math.min(...heightRanges.map((range) => range.minHeight));
  const maxHeight = Math.max(...heightRanges.map((range) => range.maxHeight));

  return [
    degreesToRadians(bounds.minLon),
    degreesToRadians(bounds.minLat),
    degreesToRadians(bounds.maxLon),
    degreesToRadians(bounds.maxLat),
    minHeight,
    Math.max(maxHeight, minHeight + 1),
  ];
}
