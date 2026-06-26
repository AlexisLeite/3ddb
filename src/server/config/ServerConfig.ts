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
    lod: string;
    verticalScale: number;
    heightMode: string;
    verticalOffsetMeters: number;
  };
  query: {
    maxSurfacesPerResponse: number;
    minQueryRadiusMeters: number;
    maxQueryRadiusMeters: number;
  };
  sql: {
    maxLength: number;
    maxRows: number;
    maxRenderIds: number;
    timeoutMs: number;
    registryLimit: number;
    registryTtlMs: number;
  };
  tiles: {
    gridDivisions: number;
    rootGeometricError: number;
    datasetGeometricError: number;
    responseCacheLimit: number;
    responseCacheMs: number;
    baseColorFactor: number[];
    vertexColors: Record<string, number[]>;
    renderEdges: boolean;
    edgeOffsetMeters: number;
    groundSurfaceOffsetMeters: number;
    version: string;
  };
}
