import type { PointOfInterest } from "../gallery/PointOfInterest.js";

interface Bounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

/**
 * Controls Cesium camera focus and flight behavior for the loaded gallery while
 * keeping camera math isolated from presentational React components and stores.
 */
export class FocusController {
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
   * Moves the Cesium camera to a rectangle that contains the provided bounds,
   * clearing tracked entities and forcing a render after the view changes.
   */
  focusBounds(frameWindow: Window | null, bounds: Bounds): boolean {
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
    viewer.camera.setView({ destination });
    viewer.scene?.requestRender?.();
    return true;
  }

  /**
   * Flies the Cesium camera to a specific point of interest and leaves the
   * selected coordinates centered with a stable heading, pitch and range.
   */
  async flyToPoint(frameWindow: Window | null, point: PointOfInterest): Promise<boolean> {
    const Cesium = (frameWindow as any)?.Cesium;
    const viewer = (frameWindow as any)?.cesiumViewer;
    if (!Cesium?.Cartesian3 || !Cesium?.HeadingPitchRange || !viewer?.camera) return false;

    const target = Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, 48);
    const offset = new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-48), 850);
    viewer.trackedEntity = undefined;
    viewer.camera.cancelFlight?.();
    if (Cesium.Matrix4) {
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }

    if (Cesium.BoundingSphere && typeof viewer.camera.flyToBoundingSphere === "function") {
      await viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(target, 70), {
        duration: 1.15,
        offset,
      });
    } else {
      viewer.camera.lookAt(target, offset);
    }
    viewer.camera.lookAt(target, offset);
    if (Cesium.Matrix4) {
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }
    viewer.scene?.requestRender?.();
    return true;
  }
}
