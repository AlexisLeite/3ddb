import type { ServerConfig } from "../config/ServerConfig.js";
import type { DatasetMetadata } from "../domain/DatasetMetadata.js";
import type { SurfaceData } from "../domain/SurfaceData.js";
import { b3dmFromMesh } from "./binary/b3dmFromMesh.js";
import { emptyB3dm } from "./binary/emptyB3dm.js";
import { datasetVerticalOffsetMeters } from "./datasetVerticalOffsetMeters.js";
import { localFrameForDataset } from "./localFrameForDataset.js";
import { meshFromSurfaces } from "./meshFromSurfaces.js";
import { regionFromDataset } from "./regionFromDataset.js";
import { regionFromBounds } from "./regionFromBounds.js";
import { tileBoundsForDataset } from "./tileBoundsForDataset.js";
import { tileUriForDataset } from "./tileUriForDataset.js";

/**
 * Builds 3D Tiles metadata and binary tile payloads from loaded surfaces while
 * keeping Cesium tile structure separate from database access.
 */
export class DataTiler {
  constructor(private readonly config: ServerConfig) {}

  /**
   * Builds the root 3D Tiles tileset document for the connected dataset,
   * including child tile regions, transforms and b3dm content URIs.
   */
  buildTileset(dataset: DatasetMetadata, queryId: string | null = null): Record<string, unknown> {
    const rootRegion = regionFromDataset(dataset, this.config);
    if (!rootRegion) {
      throw new Error("The connected 3DCityDB dataset has no valid bounds");
    }

    return {
      asset: {
        version: "1.0",
        tilesetVersion: this.config.tiles.version,
        gltfUpAxis: "Y",
      },
      geometricError: this.config.tiles.rootGeometricError,
      root: {
        boundingVolume: {
          region: rootRegion,
        },
        geometricError: this.config.tiles.rootGeometricError,
        refine: "REPLACE",
        children: [this.buildDatasetTile(dataset, queryId)],
      },
      properties: {
        geometryId: {},
        featureId: {},
        objectId: {},
        className: {},
        lod: {},
        property: {},
        surfaceType: {},
      },
    };
  }

  /**
   * Converts loaded surface data into a b3dm tile, returning a valid empty tile
   * whenever no renderable surfaces or local frame can be produced.
   */
  buildTile(surfaceData: SurfaceData): Buffer {
    if (surfaceData.surfaces.length === 0) return emptyB3dm();

    const frame = localFrameForDataset(surfaceData.dataset, this.config);
    if (!frame) return emptyB3dm();

    const mesh = meshFromSurfaces(surfaceData.surfaces, frame, this.config);
    return b3dmFromMesh(mesh, this.config);
  }

  /**
   * Returns a valid empty b3dm tile payload for callers that need explicit
   * empty content without passing through surface mesh generation.
   */
  emptyTile(): Buffer {
    return emptyB3dm();
  }

  private buildDatasetTile(
    dataset: DatasetMetadata,
    queryId: string | null,
  ): Record<string, unknown> {
    const verticalOffsetMeters = datasetVerticalOffsetMeters(dataset, this.config);
    const frame = localFrameForDataset(dataset, this.config, verticalOffsetMeters);
    if (!frame) {
      throw new Error("The connected 3DCityDB dataset has no valid bounds");
    }

    return {
      boundingVolume: {
        region: regionFromBounds(frame.bounds, this.config, verticalOffsetMeters),
      },
      geometricError: this.config.tiles.datasetGeometricError,
      refine: "REPLACE",
      children: tileBoundsForDataset(dataset, this.config).map((tile) => ({
        boundingVolume: {
          region: regionFromBounds(tile.bounds, this.config, verticalOffsetMeters),
        },
        geometricError: 0,
        refine: "REPLACE",
        transform: frame.transform,
        content: {
          uri: tileUriForDataset(this.config, tile.bounds, queryId),
        },
      })),
    };
  }
}
