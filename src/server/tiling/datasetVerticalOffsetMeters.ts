import type { ServerConfig } from "../config/ServerConfig.js";
import type { DatasetMetadata } from "../domain/DatasetMetadata.js";

/**
 * Calculates the vertical offset for the connected dataset using height mode
 * and the configured global vertical adjustment.
 */
export function datasetVerticalOffsetMeters(
  dataset: DatasetMetadata,
  config: ServerConfig,
): number {
  const groundOffset =
    config.nyc.heightMode === "relative"
      ? -Number(dataset.bounds?.minZ || 0) * config.nyc.verticalScale
      : 0;
  return groundOffset + config.nyc.verticalOffsetMeters;
}
