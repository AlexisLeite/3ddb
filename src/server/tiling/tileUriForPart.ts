import type { ServerConfig } from "../config/ServerConfig.js";
import type { Bounds } from "../domain/Bounds.js";
import type { CityPart } from "../domain/CityPart.js";

/**
 * Builds the relative b3dm content URI for a generated child tile, including
 * part identity, bounds and style version query parameters.
 */
export function tileUriForPart(
  part: CityPart,
  config: ServerConfig,
  bounds: Bounds | null,
  queryId: string | null = null,
): string {
  const url = new URL("http://localhost/tile.b3dm");
  url.searchParams.set("parts", part.id);
  url.searchParams.set("heightMode", config.nyc.heightMode);
  url.searchParams.set("style", config.tiles.version);
  if (bounds) {
    url.searchParams.set("minLon", bounds.minLon.toString());
    url.searchParams.set("minLat", bounds.minLat.toString());
    url.searchParams.set("maxLon", bounds.maxLon.toString());
    url.searchParams.set("maxLat", bounds.maxLat.toString());
  }
  if (config.nyc.verticalOffsetMeters !== 0) {
    url.searchParams.set("zOffset", config.nyc.verticalOffsetMeters.toString());
  }
  if (queryId) url.searchParams.set("queryId", queryId);
  return `${url.pathname.slice(1)}${url.search}`;
}
