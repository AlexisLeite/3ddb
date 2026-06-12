import type { PointOfInterest } from "../gallery/PointOfInterest.js";
import type { CameraView } from "./CameraView.js";

const focusScreenX = 0.25;

/**
 * Computes and applies low-level Cesium camera poses, including the horizontal
 * screen offset that keeps tour points clear of the explanatory panel.
 */
export class CameraViewController {
  /**
   * Captures the current Cesium camera pose in world coordinates so custom
   * animations can start from the exact visible camera state without jumps.
   */
  captureCameraView(Cesium: any, viewer: any): CameraView | null {
    if (!Cesium?.Cartesian3 || !viewer?.camera) return null;

    return {
      destination: Cesium.Cartesian3.clone(viewer.camera.positionWC),
      direction: Cesium.Cartesian3.clone(viewer.camera.directionWC),
      up: Cesium.Cartesian3.clone(viewer.camera.upWC),
    };
  }

  /**
   * Places the live camera around a point with the configured left-side screen
   * offset and requests a Cesium render after the pose is applied.
   */
  lookAtPoint(
    Cesium: any,
    viewer: any,
    point: PointOfInterest,
    headingRadians: number,
    pitchDegrees: number,
    rangeMeters: number,
  ): boolean {
    const target = Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, 60);
    viewer.camera.lookAt(
      target,
      new Cesium.HeadingPitchRange(
        headingRadians,
        Cesium.Math.toRadians(pitchDegrees),
        rangeMeters,
      ),
    );
    if (Cesium.Matrix4) viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    this.applyHorizontalScreenOffset(Cesium, viewer, target, focusScreenX);
    viewer.scene?.requestRender?.();
    return true;
  }

  /**
   * Computes the offset orbital camera pose for a point without mutating the
   * visible camera, so Cesium flyTo can animate directly to the final view.
   */
  offsetCameraView(
    Cesium: any,
    viewer: any,
    point: PointOfInterest,
    headingRadians: number,
    pitchDegrees: number,
    rangeMeters: number,
  ): CameraView | null {
    if (typeof Cesium.Camera !== "function") return null;

    const camera = new Cesium.Camera(viewer.scene);
    camera.setView({
      destination: Cesium.Cartesian3.clone(viewer.camera.positionWC),
      orientation: {
        direction: Cesium.Cartesian3.clone(viewer.camera.directionWC),
        up: Cesium.Cartesian3.clone(viewer.camera.upWC),
      },
    });
    const target = Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, 60);
    camera.lookAt(
      target,
      new Cesium.HeadingPitchRange(
        headingRadians,
        Cesium.Math.toRadians(pitchDegrees),
        rangeMeters,
      ),
    );
    if (Cesium.Matrix4) camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    this.applyHorizontalScreenOffset(Cesium, { camera, canvas: viewer.canvas }, target, focusScreenX);

    return {
      destination: Cesium.Cartesian3.clone(camera.positionWC),
      direction: Cesium.Cartesian3.clone(camera.directionWC),
      up: Cesium.Cartesian3.clone(camera.upWC),
    };
  }

  /**
   * Blends from a captured camera pose toward the offset orbital pose for a
   * point, letting tour transitions translate and rotate in one animation.
   */
  setBlendedPointView(
    Cesium: any,
    viewer: any,
    startView: CameraView,
    targetView: CameraView,
    progress: number,
  ): boolean {
    const destination = Cesium.Cartesian3.lerp(
      startView.destination,
      targetView.destination,
      progress,
      new Cesium.Cartesian3(),
    );
    const direction = this.normalizedLerp(Cesium, startView.direction, targetView.direction, progress);
    const up = this.normalizedLerp(Cesium, startView.up, targetView.up, progress);

    this.preserveWorldCameraTransform(Cesium, viewer);
    viewer.camera.setView({ destination, orientation: { direction, up } });
    viewer.scene?.requestRender?.();
    return true;
  }

  /**
   * Clears Cesium local camera transforms while preserving the visible world
   * pose so subsequent animations begin from the camera the user currently sees.
   */
  preserveWorldCameraTransform(Cesium: any, viewer: any): void {
    const camera = viewer.camera;
    if (!Cesium.Matrix4 || typeof camera.lookAtTransform !== "function") return;

    const position = Cesium.Cartesian3.clone(camera.positionWC);
    const direction = Cesium.Cartesian3.clone(camera.directionWC);
    const up = Cesium.Cartesian3.clone(camera.upWC);
    camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    camera.setView({ destination: position, orientation: { direction, up } });
  }

  private applyHorizontalScreenOffset(Cesium: any, viewer: any, target: any, screenX: number): void {
    viewer.camera.moveRight(this.horizontalScreenOffsetMeters(Cesium, viewer, target, screenX));
  }

  private horizontalScreenOffsetMeters(Cesium: any, viewer: any, target: any, screenX: number): number {
    const camera = viewer.camera;
    const frustum = camera.frustum;
    const distance = Cesium.Cartesian3.distance(camera.positionWC, target);
    const aspectRatio = frustum.aspectRatio || viewer.canvas?.clientWidth / viewer.canvas?.clientHeight || 1;
    const verticalFov = frustum.fovy || Cesium.Math.toRadians(60);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspectRatio);
    return (1 - 2 * screenX) * distance * Math.tan(horizontalFov / 2);
  }

  private normalizedLerp(Cesium: any, from: any, to: any, progress: number): any {
    return Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.lerp(from, to, progress, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
  }
}
