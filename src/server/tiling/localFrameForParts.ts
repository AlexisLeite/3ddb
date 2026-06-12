import { Vector3 } from "three";
import type { ServerConfig } from "../config/ServerConfig.js";
import type { Bounds } from "../domain/Bounds.js";
import type { CityPart } from "../domain/CityPart.js";
import type { LocalFrame } from "../domain/LocalFrame.js";
import { geodeticToEcef } from "./geodeticToEcef.js";
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

function verticalOffsetForParts(parts: CityPart[], config: ServerConfig): number {
  if (parts.length === 0) return config.nyc.verticalOffsetMeters;
  if (parts.length === 1) return partVerticalOffsetMeters(parts[0], config);

  const minZ = Math.min(...parts.map((part) => Number(part.bounds?.minZ || 0)));
  const groundOffset = config.nyc.heightMode === "relative" ? -minZ * config.nyc.verticalScale : 0;
  return groundOffset + config.nyc.verticalOffsetMeters;
}

/**
 * Builds a local east-north-up frame for one or more city parts so geographic
 * coordinates can be transformed into tile-local mesh coordinates.
 */
export function localFrameForParts(
  parts: CityPart[],
  config: ServerConfig,
  verticalOffsetMeters = verticalOffsetForParts(parts, config),
): LocalFrame | null {
  const bounds = unionBounds(parts);
  if (!bounds) return null;

  const lon = (bounds.minLon + bounds.maxLon) / 2;
  const lat = (bounds.minLat + bounds.maxLat) / 2;
  const longitude = degreesToRadians(lon);
  const latitude = degreesToRadians(lat);
  const sinLat = Math.sin(latitude);
  const cosLat = Math.cos(latitude);
  const sinLon = Math.sin(longitude);
  const cosLon = Math.cos(longitude);
  const origin = geodeticToEcef(lon, lat, 0);
  const east = new Vector3(-sinLon, cosLon, 0);
  const north = new Vector3(-sinLat * cosLon, -sinLat * sinLon, cosLat);
  const up = new Vector3(cosLat * cosLon, cosLat * sinLon, sinLat);

  return {
    bounds,
    lon,
    lat,
    origin,
    east,
    north,
    up,
    verticalOffsetMeters,
    transform: [
      east.x,
      east.y,
      east.z,
      0,
      north.x,
      north.y,
      north.z,
      0,
      up.x,
      up.y,
      up.z,
      0,
      origin.x,
      origin.y,
      origin.z,
      1,
    ],
  };
}
