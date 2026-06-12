/**
 * Wires Cesium canvas interaction events to a callback so automatic camera
 * orbiting can pause during manual user zoom, pan and touch gestures.
 */
export class CameraInteractionController {
  private isPointerDown = false;

  private isBound = false;

  constructor(private readonly onManualInteraction: () => void) {}

  /**
   * Binds wheel, pointer and touch listeners exactly once to the Cesium canvas
   * exposed by the embedded 3DCityDB client.
   */
  bind(frameWindow: Window): void {
    if (this.isBound) return;

    const canvas = ((frameWindow as any)?.cesiumViewer?.canvas || null) as HTMLCanvasElement | null;
    if (!canvas) return;

    canvas.addEventListener("wheel", this.onManualInteraction, { passive: true });
    canvas.addEventListener("pointerdown", this.handlePointerDown, { passive: true });
    canvas.addEventListener("pointermove", this.handlePointerMove, { passive: true });
    canvas.addEventListener("pointerup", this.handlePointerUp, { passive: true });
    canvas.addEventListener("pointercancel", this.handlePointerUp, { passive: true });
    canvas.addEventListener("touchmove", this.onManualInteraction, { passive: true });
    this.isBound = true;
  }

  private readonly handlePointerDown = (): void => {
    this.isPointerDown = true;
    this.onManualInteraction();
  };

  private readonly handlePointerMove = (): void => {
    if (this.isPointerDown) this.onManualInteraction();
  };

  private readonly handlePointerUp = (): void => {
    this.isPointerDown = false;
    this.onManualInteraction();
  };
}
