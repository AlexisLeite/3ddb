import type { ServerConfig } from "../config/ServerConfig.js";
import type { DBManager } from "../db/DBManager.js";
import type { Bounds } from "../domain/Bounds.js";
import type { DatasetMetadata } from "../domain/DatasetMetadata.js";
import type { SpatialWindow } from "../domain/SpatialWindow.js";
import type { Surface } from "../domain/Surface.js";
import type { SurfaceData } from "../domain/SurfaceData.js";
import type { SqlRenderFilter } from "../sql/SqlRenderFilter.js";
import type { BoundsRow } from "./BoundsRow.js";
import type { CityStatsRow } from "./CityStatsRow.js";
import { cityStatsQuery, datasetBoundsQuery, surfaceQuery } from "./queries.js";
import { spatialWindowFromDataset } from "./spatialWindowFromDataset.js";
import type { SurfaceRow } from "./SurfaceRow.js";

/**
 * Loads connected-dataset metadata and renderable surface polygons from
 * 3DCityDB for HTTP metadata and dynamic 3D Tiles routes.
 */
export class DataLoader {
  private datasetCache: DatasetMetadata | null = null;

  constructor(
    private readonly db: DBManager,
    private readonly config: ServerConfig,
  ) {}

  /**
   * Returns connected dataset metadata from memory or the database.
   */
  async getDataset(): Promise<DatasetMetadata> {
    if (this.datasetCache) return this.datasetCache;
    return this.refreshDataset();
  }

  /**
   * Rebuilds the connected dataset metadata from database statistics and bounds.
   */
  async refreshDataset(): Promise<DatasetMetadata> {
    const [cityStatsResult, datasetBoundsResult] = await Promise.all([
      this.db.query<CityStatsRow>(cityStatsQuery),
      this.db.query<BoundsRow>(datasetBoundsQuery),
    ]);
    const stats = cityStatsResult.rows[0];
    const bounds = this.boundsFromRow(datasetBoundsResult.rows[0]);
    this.datasetCache = {
      label: "New York City",
      detail: "CityGML 2.0 LoD2 dataset imported into the connected 3DCityDB database",
      version: "CityGML 2.0",
      lod: this.config.nyc.lod,
      verticalScale: this.config.nyc.verticalScale,
      imported: Boolean((stats?.features || 0) > 0 && bounds),
      bounds,
      stats: {
        features: stats?.features || 0,
        buildings: 0,
        lods: [],
      },
    };
    return this.datasetCache;
  }

  /**
   * Builds the serializable metadata response for the connected database and dataset.
   */
  metadataPayload(dataset: DatasetMetadata): Record<string, unknown> {
    return {
      database: this.databasePayload(),
      dataset,
    };
  }

  /**
   * Loads renderable surface polygons within the requested or inferred spatial
   * window, applying configured response limits and optional SQL render filters.
   */
  async loadSurfaces(
    requestedView: SpatialWindow | null,
    renderFilter: SqlRenderFilter | null = null,
  ): Promise<SurfaceData> {
    const dataset = await this.getDataset();
    const view = requestedView || spatialWindowFromDataset(dataset);

    if (!dataset.imported || !view) {
      return {
        dataset,
        view,
        surfaces: [],
      };
    }

    const result = await this.db.query<SurfaceRow>(surfaceQuery, [
      this.config.nyc.lod,
      this.config.query.maxSurfacesPerResponse,
      view.minLon,
      view.minLat,
      view.maxLon,
      view.maxLat,
      this.config.nyc.verticalScale,
      renderFilter?.kind || "none",
      renderFilter?.ids || [],
    ]);

    return {
      dataset,
      view,
      surfaces: result.rows.map((row): Surface => ({
        geometryId: row.geometry_id,
        featureId: row.feature_id,
        objectId: row.objectid,
        className: row.classname,
        lod: row.lod,
        property: row.property_name,
        rings: row.geojson.coordinates,
        geojson: row.geojson,
      })),
    };
  }

  private databasePayload(): Record<string, unknown> {
    return {
      host: this.config.db.host,
      port: this.config.db.port,
      name: this.config.db.database,
      schema: "citydb",
    };
  }

  private boundsFromRow(row: BoundsRow | undefined): Bounds | null {
    if (!row || !Number.isFinite(row.minLon) || !Number.isFinite(row.minLat)) {
      return null;
    }
    return {
      minLon: row.minLon,
      minLat: row.minLat,
      minZ: row.minZ || 0,
      maxLon: row.maxLon,
      maxLat: row.maxLat,
      maxZ: row.maxZ || 0,
    };
  }
}
