import type { ServerConfig } from "../config/ServerConfig.js";
import type { DatasetMetadata } from "../domain/DatasetMetadata.js";
import { datasetVerticalOffsetMeters } from "./datasetVerticalOffsetMeters.js";

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

/**
 * Creates the root 3D Tiles region from connected dataset bounds and configured heights.
 */
export function regionFromDataset(
  dataset: DatasetMetadata,
  config: ServerConfig,
): number[] | null {
  const bounds = dataset.bounds;
  if (!bounds) return null;

  const verticalOffsetMeters = datasetVerticalOffsetMeters(dataset, config);
  const minHeight = Number(bounds.minZ || 0) * config.nyc.verticalScale + verticalOffsetMeters;
  const maxHeight = Number(bounds.maxZ || 0) * config.nyc.verticalScale + verticalOffsetMeters;

  return [
    degreesToRadians(bounds.minLon),
    degreesToRadians(bounds.minLat),
    degreesToRadians(bounds.maxLon),
    degreesToRadians(bounds.maxLat),
    minHeight,
    Math.max(maxHeight, minHeight + 1),
  ];
}
