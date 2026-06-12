import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ServerConfig } from "../config/ServerConfig.js";
import type { DBManager } from "../db/DBManager.js";
import type { Bounds } from "../domain/Bounds.js";
import type { CityPart } from "../domain/CityPart.js";
import { createPartConfigs } from "../domain/createPartConfigs.js";
import { sortPartIds } from "../domain/sortPartIds.js";
import type { SpatialWindow } from "../domain/SpatialWindow.js";
import type { Surface } from "../domain/Surface.js";
import type { SurfaceData } from "../domain/SurfaceData.js";
import { cityStatsQuery, partBoundsQuery, surfaceQuery } from "./queries.js";

interface CityStatsRow {
  id: string;
  features: number;
}

interface BoundsRow extends Bounds {
  id: string;
}

interface SurfaceRow {
  lineage: string;
  geometry_id: number;
  feature_id: number;
  objectid: string;
  classname: string;
  lod: string;
  property_name: string;
  geojson: {
    type: string;
    coordinates: number[][][];
  };
}

/**
 * Loads imported city parts and renderable surface polygons from 3DCityDB while
 * managing the lightweight part metadata cache used by HTTP routes.
 */
export class DataLoader {
  private readonly partConfigs: CityPart[];

  private readonly validPartIds: Set<string>;

  private partsCache: CityPart[] | null = null;

  private partsCacheTime = 0;

  constructor(
    private readonly db: DBManager,
    private readonly config: ServerConfig,
  ) {
    this.partConfigs = createPartConfigs(
      config.nyc.partCount,
      config.nyc.lod,
      config.nyc.verticalScale,
    );
    this.validPartIds = new Set(this.partConfigs.map((part) => part.id));
  }

  normalizePartIds(partsParam: string | null): string[] {
    if (!partsParam) return [this.config.nyc.defaultPartId];

    const ids = partsParam
      .split(",")
      .map((partId) => partId.trim())
      .filter((partId) => this.validPartIds.has(partId));
    return sortPartIds([...new Set(ids)]);
  }

  async getParts(): Promise<CityPart[]> {
    const age = Date.now() - this.partsCacheTime;
    if (this.partsCache && age < this.config.nyc.partsCacheMs) {
      return this.partsCache;
    }

    if (!this.config.nyc.refreshPartsOnStart && existsSync(this.config.nyc.partsCachePath)) {
      const cachedPayload = JSON.parse(readFileSync(this.config.nyc.partsCachePath, "utf8")) as {
        parts: CityPart[];
      };
      this.partsCache = cachedPayload.parts;
      this.partsCacheTime = Date.now();
      return cachedPayload.parts;
    }

    try {
      return await this.refreshParts();
    } catch (error) {
      if (existsSync(this.config.nyc.partsCachePath)) {
        const cachedPayload = JSON.parse(readFileSync(this.config.nyc.partsCachePath, "utf8")) as {
          parts: CityPart[];
        };
        this.partsCache = cachedPayload.parts;
        this.partsCacheTime = Date.now();
        return cachedPayload.parts;
      }
      throw error;
    }
  }

  async refreshParts(): Promise<CityPart[]> {
    const [cityStatsResult, partBoundsResult] = await Promise.all([
      this.db.query<CityStatsRow>(cityStatsQuery),
      this.db.query<BoundsRow>(partBoundsQuery),
    ]);
    const cityStats = new Map(cityStatsResult.rows.map((row) => [row.id, row]));
    const partBounds = new Map(partBoundsResult.rows.map((row) => [row.id, row]));

    this.partsCache = this.partConfigs.map((part) => {
      const stats = cityStats.get(part.id);
      const bounds = partBounds.get(part.id);
      return {
        ...part,
        imported: Boolean(stats && bounds),
        bounds: bounds
          ? {
              minLon: bounds.minLon,
              minLat: bounds.minLat,
              minZ: bounds.minZ || 0,
              maxLon: bounds.maxLon,
              maxLat: bounds.maxLat,
              maxZ: bounds.maxZ || 0,
            }
          : null,
        stats: {
          features: stats?.features || 0,
          buildings: 0,
          lods: [],
        },
      };
    });
    this.partsCacheTime = Date.now();
    mkdirSync(dirname(this.config.nyc.partsCachePath), { recursive: true });
    writeFileSync(
      this.config.nyc.partsCachePath,
      JSON.stringify(this.partsPayload(this.partsCache), null, 2),
    );
    return this.partsCache;
  }

  partsPayload(parts: CityPart[]): Record<string, unknown> {
    return {
      database: this.databasePayload(),
      dataset: {
        id: "NYC",
        label: "New York City",
        detail: "CityGML 2.0 LoD2 delivery areas imported into 3DCityDB",
        lod: this.config.nyc.lod,
        version: "CityGML 2.0",
        verticalScale: this.config.nyc.verticalScale,
      },
      parts,
    };
  }

  async getImportedParts(requestedPartIds: string[]): Promise<CityPart[]> {
    const parts = await this.getParts();
    const importedPartMap = new Map(
      parts.filter((part) => part.imported).map((part) => [part.id, part]),
    );
    return requestedPartIds
      .map((partId) => importedPartMap.get(partId))
      .filter((part): part is CityPart => Boolean(part));
  }

  async loadSurfaces(partIds: string[], requestedView: SpatialWindow | null): Promise<SurfaceData> {
    const parts = await this.getImportedParts(partIds);
    const view = requestedView || this.spatialWindowFromParts(parts);

    if (parts.length === 0 || !view) {
      return {
        partIds: [],
        parts,
        view,
        surfaces: [],
      };
    }

    const perPartLimit = this.limitPerPart(parts.length);
    const result = await this.db.query<SurfaceRow>(surfaceQuery, [
      parts.map((part) => part.id),
      this.config.nyc.lod,
      perPartLimit,
      view.minLon,
      view.minLat,
      view.maxLon,
      view.maxLat,
      this.config.nyc.verticalScale,
    ]);

    return {
      partIds: parts.map((part) => part.id),
      parts,
      view,
      surfaces: result.rows.map((row): Surface => ({
        partId: row.lineage,
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

  private limitPerPart(partCount: number): number {
    if (partCount <= 0) return this.config.query.maxSurfacesPerPart;
    const sharedLimit = Math.floor(this.config.query.maxSurfacesPerResponse / partCount);
    return Math.max(
      this.config.query.minSurfacesPerPart,
      Math.min(this.config.query.maxSurfacesPerPart, sharedLimit),
    );
  }

  private spatialWindowFromParts(parts: CityPart[]): SpatialWindow | null {
    const bounds = parts.map((part) => part.bounds).filter((bounds): bounds is Bounds => Boolean(bounds));
    if (bounds.length === 0) return null;

    const union = bounds.reduce(
      (acc, item) => ({
        minLon: Math.min(acc.minLon, item.minLon),
        minLat: Math.min(acc.minLat, item.minLat),
        maxLon: Math.max(acc.maxLon, item.maxLon),
        maxLat: Math.max(acc.maxLat, item.maxLat),
      }),
      {
        minLon: Infinity,
        minLat: Infinity,
        maxLon: -Infinity,
        maxLat: -Infinity,
      },
    );
    const lat = (union.minLat + union.maxLat) / 2;
    const latSpanMeters = (union.maxLat - union.minLat) * 111320;
    const lonSpanMeters =
      (union.maxLon - union.minLon) * Math.max(111320 * Math.cos((lat * Math.PI) / 180), 1);

    return {
      ...union,
      lon: (union.minLon + union.maxLon) / 2,
      lat,
      radiusMeters: Math.max(latSpanMeters, lonSpanMeters) / 2,
    };
  }
}
