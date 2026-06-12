import type { ServerConfig } from "../config/ServerConfig.js";
import type { CityPart } from "../domain/CityPart.js";

/**
 * Calculates the vertical offset for a city part based on height mode, source
 * bounds and configured global vertical adjustment.
 */
export function partVerticalOffsetMeters(part: CityPart, config: ServerConfig): number {
  const groundOffset =
    config.nyc.heightMode === "relative"
      ? -Number(part.bounds?.minZ || 0) * config.nyc.verticalScale
      : 0;
  return groundOffset + config.nyc.verticalOffsetMeters;
}
