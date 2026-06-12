import type { PointOfInterest } from "../gallery/PointOfInterest.js";
import type { Bounds } from "./Bounds.js";
import type { CameraView } from "./CameraView.js";
import { CameraViewController } from "./CameraViewController.js";

const defaultFlightDurationSeconds = 1.15;

/**
 * Controls Cesium camera focus and flight behavior for the loaded gallery while
 * keeping camera math isolated from presentational React components and stores.
 */
export class FocusController {
  private readonly cameraViews = new CameraViewController();

  constructor(private readonly fallbackBounds: Bounds) {}

  /**
   * Calculates the minimal geographic bounding box containing every gallery
   * point, falling back to the configured dataset bounds when no points exist.
   */
  boundsForPoints(points: PointOfInterest[]): Bounds {
    if (points.length === 0) return this.fallbackBounds;

    return points.reduce(
      (bounds, point) => ({
        minLon: Math.min(bounds.minLon, point.longitude),
        minLat: Math.min(bounds.minLat, point.latitude),
        maxLon: Math.max(bounds.maxLon, point.longitude),
        maxLat: Math.max(bounds.maxLat, point.latitude),
      }),
      {
        minLon: Infinity,
        minLat: Infinity,
        maxLon: -Infinity,
        maxLat: -Infinity,
      },
    );
  }

  /**
   * Expands a geographic bounding box by a stable padding factor so Cesium can
   * frame all points without placing labels directly against the viewport edge.
   */
  paddedBounds(bounds: Bounds, factor = 0.28): Bounds {
    const lonPadding = Math.max((bounds.maxLon - bounds.minLon) * factor, 0.002);
    const latPadding = Math.max((bounds.maxLat - bounds.minLat) * factor, 0.002);
    return {
      minLon: bounds.minLon - lonPadding,
      minLat: bounds.minLat - latPadding,
      maxLon: bounds.maxLon + lonPadding,
      maxLat: bounds.maxLat + latPadding,
    };
  }

  /**
   * Animates the Cesium camera to a rectangle containing the provided bounds,
   * resolving when the camera transition completes or is cancelled.
   */
  async flyToBounds(frameWindow: Window | null, bounds: Bounds): Promise<boolean> {
    const Cesium = (frameWindow as any)?.Cesium;
    const viewer = (frameWindow as any)?.cesiumViewer;
    if (!Cesium?.Rectangle || !viewer?.camera) return false;

    const padded = this.paddedBounds(bounds);
    const destination = Cesium.Rectangle.fromDegrees(
      padded.minLon,
      padded.minLat,
      padded.maxLon,
      padded.maxLat,
    );
    viewer.trackedEntity = undefined;
    viewer.camera.cancelFlight?.();
    if (typeof viewer.camera.flyTo !== "function") return false;
    this.cameraViews.preserveWorldCameraTransform(Cesium, viewer);

    return this.flyTo(viewer, { destination });
  }

  /**
   * Flies the Cesium camera to a specific point of interest and leaves the
   * selected coordinates offset left so the explanatory panel stays clear.
   */
  async flyToPoint(
    frameWindow: Window | null,
    point: PointOfInterest,
    headingRadians = 0,
    pitchDegrees = -50,
    rangeMeters = 720,
  ): Promise<boolean> {
    const Cesium = (frameWindow as any)?.Cesium;
    const viewer = (frameWindow as any)?.cesiumViewer;
    if (!Cesium?.Cartesian3 || !Cesium?.HeadingPitchRange || !viewer?.camera) return false;

    const cameraView = this.cameraViews.offsetCameraView(
      Cesium,
      viewer,
      point,
      headingRadians,
      pitchDegrees,
      rangeMeters,
    );
    if (!cameraView || typeof viewer.camera.flyTo !== "function") return false;

    viewer.trackedEntity = undefined;
    viewer.camera.cancelFlight?.();
    this.cameraViews.preserveWorldCameraTransform(Cesium, viewer);
    return this.flyTo(viewer, {
      destination: cameraView.destination,
      orientation: { direction: cameraView.direction, up: cameraView.up },
    });
  }

  /**
   * Places the camera around a point using a heading, pitch and range while
   * keeping that point at the gallery focus screen coordinate instead of center.
   */
  lookAtPoint(
    frameWindow: Window | null,
    point: PointOfInterest,
    headingRadians: number,
    pitchDegrees: number,
    rangeMeters: number,
  ): boolean {
    const Cesium = (frameWindow as any)?.Cesium;
    const viewer = (frameWindow as any)?.cesiumViewer;
    if (!Cesium?.Cartesian3 || !Cesium?.HeadingPitchRange || !viewer?.camera) return false;
    return this.cameraViews.lookAtPoint(Cesium, viewer, point, headingRadians, pitchDegrees, rangeMeters);
  }

  /**
   * Captures the current Cesium camera pose in world coordinates so custom
   * animations can start from the exact visible camera state without jumps.
   */
  captureCameraView(frameWindow: Window | null): CameraView | null {
    const Cesium = (frameWindow as any)?.Cesium;
    const viewer = (frameWindow as any)?.cesiumViewer;
    return this.cameraViews.captureCameraView(Cesium, viewer);
  }

  /**
   * Blends from a captured camera pose toward the offset orbital pose for a
   * point, letting tour transitions translate and rotate in one animation.
   */
  setBlendedPointView(
    frameWindow: Window | null,
    startView: CameraView,
    point: PointOfInterest,
    headingRadians: number,
    pitchDegrees: number,
    rangeMeters: number,
    progress: number,
  ): boolean {
    const Cesium = (frameWindow as any)?.Cesium;
    const viewer = (frameWindow as any)?.cesiumViewer;
    if (!Cesium?.Cartesian3 || !viewer?.camera) return false;
    const targetView = this.cameraViews.offsetCameraView(
      Cesium,
      viewer,
      point,
      headingRadians,
      pitchDegrees,
      rangeMeters,
    );
    return targetView
      ? this.cameraViews.setBlendedPointView(Cesium, viewer, startView, targetView, progress)
      : false;
  }

  private flyTo(viewer: any, options: Record<string, unknown>): Promise<boolean> {
    return new Promise((resolve) => {
      viewer.camera.flyTo({
        ...options,
        duration: defaultFlightDurationSeconds,
        complete: () => {
          viewer.scene?.requestRender?.();
          resolve(true);
        },
        cancel: () => resolve(false),
      });
    });
  }
}
