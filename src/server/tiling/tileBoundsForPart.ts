import type { ServerConfig } from "../config/ServerConfig.js";
import type { CityPart } from "../domain/CityPart.js";
import type { TileBounds } from "./types/TileBounds.js";

/**
 * Splits a city part bounding box into a deterministic tile grid used as child
 * content entries in the generated 3D Tiles tileset.
 */
export function tileBoundsForPart(part: CityPart, config: ServerConfig): TileBounds[] {
  if (!part.bounds) return [];

  const { bounds } = part;
  const lonSpan = bounds.maxLon - bounds.minLon;
  const latSpan = bounds.maxLat - bounds.minLat;
  if (lonSpan <= 0 || latSpan <= 0) return [];

  const lonStep = lonSpan / config.tiles.gridDivisions;
  const latStep = latSpan / config.tiles.gridDivisions;
  const tiles: TileBounds[] = [];

  for (let y = 0; y < config.tiles.gridDivisions; y += 1) {
    for (let x = 0; x < config.tiles.gridDivisions; x += 1) {
      tiles.push({
        id: `${part.id}-${x}-${y}`,
        bounds: {
          minLon: bounds.minLon + lonStep * x,
          minLat: bounds.minLat + latStep * y,
          minZ: bounds.minZ,
          maxLon:
            x === config.tiles.gridDivisions - 1
              ? bounds.maxLon
              : bounds.minLon + lonStep * (x + 1),
          maxLat:
            y === config.tiles.gridDivisions - 1
              ? bounds.maxLat
              : bounds.minLat + latStep * (y + 1),
          maxZ: bounds.maxZ,
        },
      });
    }
  }

  return tiles;
}
