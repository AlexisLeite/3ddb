/**
 * Defines all runtime configuration consumed by server modules, including
 * database connection details, query limits and 3D tile generation settings.
 */
export interface ServerConfig {
  rootDir: string;
  webMapBaseUrl: string;
  devServerHost: string;
  tileHttpCacheControl: string;
  db: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    options: string;
  };
  nyc: {
    partCount: number;
    defaultPartId: string;
    lod: string;
    verticalScale: number;
    heightMode: string;
    verticalOffsetMeters: number;
    partsCachePath: string;
    refreshPartsOnStart: boolean;
    partsCacheMs: number;
  };
  query: {
    maxSurfacesPerResponse: number;
    maxSurfacesPerPart: number;
    minSurfacesPerPart: number;
    minQueryRadiusMeters: number;
    maxQueryRadiusMeters: number;
  };
  tiles: {
    gridDivisions: number;
    rootGeometricError: number;
    partGeometricError: number;
    responseCacheLimit: number;
    responseCacheMs: number;
    baseColorFactor: number[];
    vertexColors: Record<string, number[]>;
    edgeOffsetMeters: number;
    groundSurfaceOffsetMeters: number;
    version: string;
  };
}
