import { join } from "node:path";
import { envColorFactor } from "./envColorFactor.js";
import { envInteger } from "./envInteger.js";
import { envNumber } from "./envNumber.js";
import { envNumberList } from "./envNumberList.js";
import { envPath } from "./envPath.js";
import { envString } from "./envString.js";
import type { ServerConfig } from "./ServerConfig.js";
import { shortHash } from "./shortHash.js";

/**
 * Builds the complete server configuration from environment variables and repo
 * paths so Vite can compose the HTTP, database and tiling services.
 */
export function loadServerConfig(rootDir: string): ServerConfig {
  const nyc = {
    partCount: envInteger("NYC_PART_COUNT", 20),
    defaultPartId: envString("NYC_DEFAULT_PART_ID", "NYC_DA10"),
    lod: envString("NYC_LOD", "2"),
    verticalScale: envNumber("NYC_VERTICAL_SCALE", 0.3048006096),
    heightMode: envString("CITYDB_HEIGHT_MODE", "relative"),
    verticalOffsetMeters: envNumber("CITYDB_VERTICAL_OFFSET_METERS", 0),
    partsCachePath: envPath(
      rootDir,
      "NYC_PARTS_CACHE_PATH",
      join("data", "nycity-parts-cache.json"),
    ),
    refreshPartsOnStart:
      envString("NYC_PARTS_REFRESH_ON_START", "true").toLowerCase() === "true",
    partsCacheMs: envInteger("NYC_PARTS_CACHE_MS", 60000),
  };
  const tiles = {
    gridDivisions: Math.max(1, envInteger("TILESET_GRID_DIVISIONS", 16)),
    rootGeometricError: envNumber("TILESET_ROOT_GEOMETRIC_ERROR", 500),
    partGeometricError: envNumber("TILESET_PART_GEOMETRIC_ERROR", 250),
    responseCacheLimit: envInteger("TILE_RESPONSE_CACHE_LIMIT", 12),
    responseCacheMs: envInteger("TILE_RESPONSE_CACHE_MS", 120000),
    baseColorFactor: envNumberList("TILE_BASE_COLOR_FACTOR", [1, 1, 1, 1]),
    vertexColors: {
      roof: envColorFactor("VITE_TILE_COLOR_ROOF", "#e7ff38", "VITE_TILE_ALPHA_ROOF", 1),
      wall: envColorFactor("VITE_TILE_COLOR_WALL", "#d8ff42", "VITE_TILE_ALPHA_WALL", 1),
      floor: envColorFactor("VITE_TILE_COLOR_FLOOR", "#c4f72f", "VITE_TILE_ALPHA_FLOOR", 1),
      opening: envColorFactor("VITE_TILE_COLOR_OPENING", "#f2ff8a", "VITE_TILE_ALPHA_OPENING", 1),
      road: envColorFactor("VITE_TILE_COLOR_ROAD", "#baff3d", "VITE_TILE_ALPHA_ROAD", 1),
      edge: envColorFactor("VITE_TILE_COLOR_EDGE", "#171c12", "VITE_TILE_ALPHA_EDGE", 1),
      other: envColorFactor("VITE_TILE_COLOR_DEFAULT", "#dcff3f", "VITE_TILE_ALPHA_DEFAULT", 1),
    },
    renderEdges: envString("TILE_RENDER_EDGES", "false").toLowerCase() === "true",
    edgeOffsetMeters: envNumber("TILE_EDGE_OFFSET_METERS", 0.15),
    groundSurfaceOffsetMeters: envNumber("TILE_GROUND_SURFACE_OFFSET_METERS", 0.35),
    version: "",
  };

  tiles.version = envString("TILESET_VERSION", `citydb-${shortHash(JSON.stringify({
    lod: nyc.lod,
    heightMode: nyc.heightMode,
    verticalOffsetMeters: nyc.verticalOffsetMeters,
    baseColor: tiles.baseColorFactor,
    vertexColors: tiles.vertexColors,
    renderEdges: tiles.renderEdges,
    edgeOffsetMeters: tiles.edgeOffsetMeters,
    groundSurfaceOffsetMeters: tiles.groundSurfaceOffsetMeters,
    gridDivisions: tiles.gridDivisions,
    applyClientStyle: envString("VITE_APPLY_TILE_STYLE", "false"),
  }))}`);

  return {
    rootDir,
    webMapBaseUrl: envString(
      "WEB_MAP_BASE_URL",
      "https://www.3dcitydb.org/3dcitydb-web-map/2.0.0/",
    ),
    devServerHost: envString("DEV_SERVER_HOST", "127.0.0.1"),
    tileHttpCacheControl: envString("TILE_HTTP_CACHE_CONTROL", "no-store"),
    db: {
      host: envString("CITYDB_HOST", "127.0.0.1"),
      port: envInteger("CITYDB_PORT", 5434),
      database: envString("CITYDB_NAME", "citydb"),
      user: envString("CITYDB_USER", "citydb"),
      password: envString("CITYDB_PASSWORD", "changeMe"),
      options: envString(
        "CITYDB_OPTIONS",
        "-c max_parallel_workers_per_gather=0 -c jit=off",
      ),
    },
    nyc,
    query: {
      maxSurfacesPerResponse: envInteger("MAX_SURFACES_PER_RESPONSE", 8000000),
      maxSurfacesPerPart: envInteger("MAX_SURFACES_PER_PART", 8000000),
      minSurfacesPerPart: envInteger("MIN_SURFACES_PER_PART", 1500),
      minQueryRadiusMeters: envNumber("MIN_QUERY_RADIUS_METERS", 2000),
      maxQueryRadiusMeters: envNumber("MAX_QUERY_RADIUS_METERS", 800000),
    },
    tiles,
  };
}
