import { Vector3 } from "three";
import type { ServerConfig } from "../config/ServerConfig.js";
import type { DatasetMetadata } from "../domain/DatasetMetadata.js";
import type { LocalFrame } from "../domain/LocalFrame.js";
import { datasetVerticalOffsetMeters } from "./datasetVerticalOffsetMeters.js";
import { geodeticToEcef } from "./geodeticToEcef.js";

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

/**
 * Builds a local east-north-up frame for the connected dataset so geographic
 * coordinates can be transformed into tile-local mesh coordinates.
 */
export function localFrameForDataset(
  dataset: DatasetMetadata,
  config: ServerConfig,
  verticalOffsetMeters = datasetVerticalOffsetMeters(dataset, config),
): LocalFrame | null {
  const bounds = dataset.bounds;
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
