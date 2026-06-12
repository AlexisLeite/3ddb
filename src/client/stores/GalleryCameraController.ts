import { FocusController } from "../focus/FocusController.js";
import type { PointOfInterest } from "../gallery/PointOfInterest.js";
import { CameraInteractionController } from "./CameraInteractionController.js";
import { cameraFlightDurationMs, manualResumeDelayMs, orbitIntervalMs, presentationOrbitRadiansPerMs, tourOrbitRadiansPerMs, tourPitchDegrees, tourRangeMeters } from "./GalleryCameraSettings.js";
import { headingAfterElapsed } from "./headingAfterElapsed.js";
import { presentationCenter } from "./presentationCenter.js";
import { presentationRange } from "./presentationRange.js";
import { TourTransitionAnimator } from "./TourTransitionAnimator.js";

type OrbitMode = "idle" | "presentation" | "tour";

/**
 * Owns Cesium camera orbit, manual-interaction pauses and tour transitions so
 * the gallery store can focus on data, iframe readiness and rendered entities.
 */
export class GalleryCameraController {
  private panoramaTimer = 0;
  private panoramaHeading = 0;
  private orbitMode: OrbitMode = "idle";
  private galleryPoints: PointOfInterest[] = [];
  private tourPoint: PointOfInterest | null = null;
  private presentationPoint: PointOfInterest | null = null;
  private resumeOrbitTimer = 0;
  private readonly interaction = new CameraInteractionController(() => this.scheduleOrbitResume());
  private readonly transition: TourTransitionAnimator;

  constructor(
    private readonly focus: FocusController,
    private readonly frameWindow: () => Window | null,
    private readonly setPanoramaActive: (active: boolean) => void,
  ) {
    this.transition = new TourTransitionAnimator(this.focus, this.frameWindow);
  }

  /**
   * Registers canvas-level input listeners that pause automatic orbiting during
   * user zoom, pan or touch gestures and resume after inactivity.
   */
  bindInteractionHandlers(frameWindow: Window): void {
    this.interaction.bind(frameWindow);
  }

  /**
   * Frames the full gallery route and starts presentation orbit around the
   * complete point extent before the guided tour begins.
   */
  async showGallery(points: PointOfInterest[]): Promise<void> {
    const frameWindow = this.frameWindow();
    this.galleryPoints = [...points];
    this.tourPoint = null;
    await this.focus.flyToBounds(frameWindow, this.focus.boundsForPoints(points));
    this.startPanorama(points);
  }

  /**
   * Stops automatic orbiting and animates the camera to an individual point
   * without enabling guided-tour rotation.
   */
  async focusPoint(point: PointOfInterest): Promise<void> {
    this.stopPanorama();
    await this.focus.flyToPoint(this.frameWindow(), point);
  }

  /**
   * Transitions to the active tour point while the camera continues rotating,
   * then resumes fixed orbit around that destination.
   */
  async focusTourPoint(point: PointOfInterest): Promise<void> {
    const heading = this.panoramaHeading;
    const destinationHeading = headingAfterElapsed(
      heading,
      cameraFlightDurationMs,
      tourOrbitRadiansPerMs,
    );
    const startView = this.focus.captureCameraView(this.frameWindow());
    const fromPoint = this.tourPoint || this.presentationPoint;
    this.clearResumeTimer();
    this.transition.cancel();
    this.stopPanorama();
    this.orbitMode = "tour";
    this.tourPoint = point;
    const completed =
      startView && fromPoint
        ? await this.transition.animate(
            startView,
            fromPoint,
            point,
            heading,
            cameraFlightDurationMs,
            tourOrbitRadiansPerMs,
            tourPitchDegrees,
            tourRangeMeters,
          )
        : await this.focus.flyToPoint(
            this.frameWindow(),
            point,
            destinationHeading,
            tourPitchDegrees,
            tourRangeMeters,
          );
    if (!completed) return;
    this.panoramaHeading = destinationHeading;
    this.startPointOrbit(point);
  }

  /**
   * Ends the guided-tour camera mode, reframes all gallery points and resumes
   * the presentation orbit around the whole route.
   */
  async finishTour(points: PointOfInterest[]): Promise<void> {
    this.galleryPoints = [...points];
    this.tourPoint = null;
    this.stopPanorama();
    const completed = await this.focus.flyToBounds(
      this.frameWindow(),
      this.focus.boundsForPoints(points),
    );
    if (completed) this.startPanorama(points);
  }

  /**
   * Stops all active orbit timers and pending animated transitions while
   * preserving the live camera pose for future animated movement.
   */
  stopPanorama(): void {
    this.clearResumeTimer();
    this.clearOrbitTimer();
    this.transition.cancel();
    this.orbitMode = "idle";
    this.setPanoramaActive(false);
  }

  private startPanorama(points: PointOfInterest[]): void {
    const frameWindow = this.frameWindow();
    const Cesium = (frameWindow as any)?.Cesium;
    const viewer = (frameWindow as any)?.cesiumViewer;
    this.galleryPoints = [...points];
    this.tourPoint = null;
    this.orbitMode = "presentation";
    this.clearResumeTimer();
    this.clearOrbitTimer();
    if (!Cesium?.Cartesian3 || !Cesium?.HeadingPitchRange || !viewer?.camera) return;

    const bounds = this.focus.boundsForPoints(points);
    const centerLon = (bounds.minLon + bounds.maxLon) / 2;
    const centerLat = (bounds.minLat + bounds.maxLat) / 2;
    this.presentationPoint = presentationCenter(centerLon, centerLat);
    const range = presentationRange(bounds, centerLat);
    const center = Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 90);
    const pitch = Cesium.Math.toRadians(-36);

    this.setPanoramaActive(true);
    this.panoramaTimer = window.setInterval(() => {
      this.panoramaHeading = headingAfterElapsed(
        this.panoramaHeading,
        orbitIntervalMs,
        presentationOrbitRadiansPerMs,
      );
      viewer.camera.lookAt(center, new Cesium.HeadingPitchRange(this.panoramaHeading, pitch, range));
      viewer.scene?.requestRender?.();
    }, orbitIntervalMs);
  }

  private startPointOrbit(point: PointOfInterest): void {
    this.orbitMode = "tour";
    this.tourPoint = point;
    this.clearResumeTimer();
    this.clearOrbitTimer();
    this.setPanoramaActive(true);
    this.renderTourOrbitFrame(point);
    this.panoramaTimer = window.setInterval(() => {
      this.panoramaHeading = headingAfterElapsed(
        this.panoramaHeading,
        orbitIntervalMs,
        tourOrbitRadiansPerMs,
      );
      this.renderTourOrbitFrame(point);
    }, orbitIntervalMs);
  }

  private renderTourOrbitFrame(point: PointOfInterest): void {
    this.focus.lookAtPoint(
      this.frameWindow(),
      point,
      this.panoramaHeading,
      tourPitchDegrees,
      tourRangeMeters,
    );
  }

  private readonly scheduleOrbitResume = (): void => {
    if (this.orbitMode === "idle") return;

    this.pauseOrbitTimer();
    this.clearResumeTimer();
    this.resumeOrbitTimer = window.setTimeout(() => {
      this.resumeOrbitAfterManualControl();
    }, manualResumeDelayMs);
  };

  private pauseOrbitTimer(): void {
    this.clearOrbitTimer();
    this.transition.cancel();
    const viewer = (this.frameWindow() as any)?.cesiumViewer;
    viewer?.camera?.cancelFlight?.();
    this.setPanoramaActive(false);
  }

  private resumeOrbitAfterManualControl(): void {
    this.resumeOrbitTimer = 0;
    if (this.orbitMode === "tour" && this.tourPoint) {
      void this.focusTourPoint(this.tourPoint);
      return;
    }

    if (this.orbitMode === "presentation" && this.galleryPoints.length > 0) {
      void this.resumePresentationOrbit();
    }
  }

  private async resumePresentationOrbit(): Promise<void> {
    const completed = await this.focus.flyToBounds(
      this.frameWindow(),
      this.focus.boundsForPoints(this.galleryPoints),
    );
    if (completed && this.orbitMode === "presentation") {
      this.startPanorama(this.galleryPoints);
    }
  }

  private clearOrbitTimer(): void {
    if (!this.panoramaTimer) return;
    window.clearInterval(this.panoramaTimer);
    this.panoramaTimer = 0;
  }

  private clearResumeTimer(): void {
    if (!this.resumeOrbitTimer) return;
    window.clearTimeout(this.resumeOrbitTimer);
    this.resumeOrbitTimer = 0;
  }

}
