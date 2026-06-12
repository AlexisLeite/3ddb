import type { CameraView } from "../focus/CameraView.js";
import type { FocusController } from "../focus/FocusController.js";
import type { PointOfInterest } from "../gallery/PointOfInterest.js";

/**
 * Animates tour movement by blending from the current camera pose while the
 * target point and orbital heading continue moving every animation frame.
 */
export class TourTransitionAnimator {
  private transitionFrame = 0;

  constructor(
    private readonly focus: FocusController,
    private readonly frameWindow: () => Window | null,
  ) {}

  /**
   * Runs a point-to-point guided-tour transition without freezing rotation,
   * resolving false when Cesium cannot apply a frame.
   */
  animate(
    startView: CameraView,
    fromPoint: PointOfInterest,
    toPoint: PointOfInterest,
    startHeading: number,
    durationMs: number,
    radiansPerMs: number,
    pitchDegrees: number,
    rangeMeters: number,
  ): Promise<boolean> {
    const startedAt = performance.now();

    return new Promise((resolve) => {
      const step = (timestamp: number) => {
        const elapsedMs = Math.min(timestamp - startedAt, durationMs);
        const progress = elapsedMs / durationMs;
        const easedProgress = this.smoothProgress(progress);
        const heading = this.headingAfterElapsed(startHeading, elapsedMs, radiansPerMs);
        const point = this.interpolatePoint(fromPoint, toPoint, easedProgress);
        const ok = this.focus.setBlendedPointView(
          this.frameWindow(),
          startView,
          point,
          heading,
          pitchDegrees,
          rangeMeters,
          easedProgress,
        );

        if (!ok || progress >= 1) {
          this.transitionFrame = 0;
          resolve(ok);
          return;
        }
        this.transitionFrame = window.requestAnimationFrame(step);
      };

      this.transitionFrame = window.requestAnimationFrame(step);
    });
  }

  /**
   * Cancels any queued animation frame so new camera commands can take over
   * without allowing an older tour transition to write another frame.
   */
  cancel(): void {
    if (!this.transitionFrame) return;
    window.cancelAnimationFrame(this.transitionFrame);
    this.transitionFrame = 0;
  }

  private headingAfterElapsed(heading: number, elapsedMs: number, radiansPerMs: number): number {
    return (heading + elapsedMs * radiansPerMs) % (Math.PI * 2);
  }

  private interpolatePoint(
    fromPoint: PointOfInterest,
    toPoint: PointOfInterest,
    progress: number,
  ): PointOfInterest {
    return {
      ...toPoint,
      latitude: fromPoint.latitude + (toPoint.latitude - fromPoint.latitude) * progress,
      longitude: fromPoint.longitude + (toPoint.longitude - fromPoint.longitude) * progress,
    };
  }

  private smoothProgress(progress: number): number {
    return progress * progress * (3 - 2 * progress);
  }
}
