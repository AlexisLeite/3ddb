/**
 * Centralizes Cesium runtime performance knobs so map loading and camera
 * animation can trade some visual detail for smoother movement on large tiles.
 */
export class CesiumPerformanceSettings {
  static applyToViewer(frameWindow: Window): void {
    const viewer = (frameWindow as any).cesiumViewer;
    const scene = viewer?.scene;
    if (!viewer || !scene) return;

    viewer.resolutionScale = this.numberEnv("VITE_CESIUM_RESOLUTION_SCALE", 0.78);
    scene.globe.maximumScreenSpaceError = this.numberEnv("VITE_GLOBE_MAX_SCREEN_SPACE_ERROR", 6);
    scene.fog.enabled = this.booleanEnv("VITE_CESIUM_FOG_ENABLED", true);
    scene.fog.density = this.numberEnv("VITE_CESIUM_FOG_DENSITY", 0.00035);
    scene.requestRenderMode = false;
  }

  static tilesetOptions(): Record<string, unknown> {
    return {
      maximumScreenSpaceError: this.numberEnv("VITE_TILESET_MAX_SCREEN_SPACE_ERROR", 8),
      dynamicScreenSpaceError: this.booleanEnv("VITE_TILESET_DYNAMIC_SCREEN_SPACE_ERROR", true),
      dynamicScreenSpaceErrorDensity: this.numberEnv(
        "VITE_TILESET_DYNAMIC_SCREEN_SPACE_ERROR_DENSITY",
        0.00278,
      ),
      dynamicScreenSpaceErrorFactor: this.numberEnv(
        "VITE_TILESET_DYNAMIC_SCREEN_SPACE_ERROR_FACTOR",
        24,
      ),
      skipLevelOfDetail: this.booleanEnv("VITE_TILESET_SKIP_LEVEL_OF_DETAIL", true),
      baseScreenSpaceError: this.numberEnv("VITE_TILESET_BASE_SCREEN_SPACE_ERROR", 1024),
      skipScreenSpaceErrorFactor: this.numberEnv("VITE_TILESET_SKIP_SCREEN_SPACE_ERROR_FACTOR", 16),
      skipLevels: this.numberEnv("VITE_TILESET_SKIP_LEVELS", 1),
      immediatelyLoadDesiredLevelOfDetail: false,
      loadSiblings: false,
      cullRequestsWhileMoving: true,
      cullRequestsWhileMovingMultiplier: this.numberEnv(
        "VITE_TILESET_CULL_REQUESTS_WHILE_MOVING_MULTIPLIER",
        40,
      ),
    };
  }

  private static envValue(name: string): string | undefined {
    return (import.meta as ImportMeta & {
      env?: Record<string, string | undefined>;
    }).env?.[name];
  }

  private static numberEnv(name: string, fallback: number): number {
    const value = Number(this.envValue(name));
    return Number.isFinite(value) ? value : fallback;
  }

  private static booleanEnv(name: string, fallback: boolean): boolean {
    const value = this.envValue(name);
    if (value === undefined) return fallback;
    return value.toLowerCase() === "true";
  }
}
