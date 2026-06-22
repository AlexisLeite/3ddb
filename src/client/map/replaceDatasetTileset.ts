import { CesiumPerformanceSettings } from "../stores/CesiumPerformanceSettings.js";

/**
 * Replaces the Cesium 3D Tiles primitive with the dataset URL that corresponds
 * to the selected part and optional SQL query render identifier.
 */
export async function replaceDatasetTileset(
  frameWindow: Window,
  partId: string,
  queryId: string | null,
  currentTileset: any,
): Promise<any> {
  const Cesium = (frameWindow as any).Cesium;
  const viewer = (frameWindow as any).cesiumViewer;
  if (!Cesium || !viewer) return currentTileset;

  const url = new URL("/api/citydb/3dtiles/tileset.json", window.location.origin);
  url.searchParams.set("parts", partId);
  if (queryId) url.searchParams.set("queryId", queryId);

  if (currentTileset) viewer.scene.primitives.remove(currentTileset);
  const options = CesiumPerformanceSettings.tilesetOptions();
  const tileset =
    typeof Cesium.Cesium3DTileset.fromUrl === "function"
      ? await Cesium.Cesium3DTileset.fromUrl(url.toString(), options)
      : new Cesium.Cesium3DTileset({ url: url.toString(), ...options });

  const addedTileset = viewer.scene.primitives.add(tileset);
  if (addedTileset.readyPromise) await addedTileset.readyPromise;
  viewer.scene.requestRender?.();
  return addedTileset;
}
