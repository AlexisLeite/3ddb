import type { ServerConfig } from "../config/ServerConfig.js";
import type { CityPart } from "../domain/CityPart.js";
import type { SurfaceData } from "../domain/SurfaceData.js";
import { b3dmFromMesh } from "./binary/b3dmFromMesh.js";
import { emptyB3dm } from "./binary/emptyB3dm.js";
import { localFrameForParts } from "./localFrameForParts.js";
import { meshFromSurfaces } from "./meshFromSurfaces.js";
import { partVerticalOffsetMeters } from "./partVerticalOffsetMeters.js";
import { regionFromBounds } from "./regionFromBounds.js";
import { regionFromParts } from "./regionFromParts.js";
import { tileBoundsForPart } from "./tileBoundsForPart.js";
import { tileUriForPart } from "./tileUriForPart.js";

/**
 * Builds 3D Tiles metadata and binary tile payloads from loaded surfaces while
 * keeping Cesium tile structure separate from database access.
 */
export class DataTiler {
  constructor(private readonly config: ServerConfig) {}

  buildTileset(parts: CityPart[]): Record<string, unknown> {
    const rootRegion = regionFromParts(parts, this.config);
    if (!rootRegion) {
      throw new Error("No imported New York City parts have valid bounds");
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
        children: parts.map((part) => this.buildPartTile(part)),
      },
      properties: {
        partId: {},
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

  buildTile(surfaceData: SurfaceData): Buffer {
    if (surfaceData.surfaces.length === 0) return emptyB3dm();

    const frame = localFrameForParts(surfaceData.parts, this.config);
    if (!frame) return emptyB3dm();

    const mesh = meshFromSurfaces(surfaceData.surfaces, frame, this.config);
    return b3dmFromMesh(mesh, this.config);
  }

  emptyTile(): Buffer {
    return emptyB3dm();
  }

  private buildPartTile(part: CityPart): Record<string, unknown> {
    const verticalOffsetMeters = partVerticalOffsetMeters(part, this.config);
    const frame = localFrameForParts([part], this.config, verticalOffsetMeters);
    if (!frame) {
      throw new Error(`Part ${part.id} has no valid bounds`);
    }

    return {
      boundingVolume: {
        region: regionFromBounds(frame.bounds, this.config, verticalOffsetMeters),
      },
      geometricError: this.config.tiles.partGeometricError,
      refine: "REPLACE",
      children: tileBoundsForPart(part, this.config).map((tile) => ({
        boundingVolume: {
          region: regionFromBounds(tile.bounds, this.config, verticalOffsetMeters),
        },
        geometricError: 0,
        refine: "REPLACE",
        transform: frame.transform,
        content: {
          uri: tileUriForPart(part, this.config, tile.bounds),
        },
      })),
    };
  }
}
