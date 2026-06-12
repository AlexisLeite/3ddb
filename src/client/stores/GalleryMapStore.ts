import { makeAutoObservable, runInAction } from "mobx";
import { FocusController } from "../focus/FocusController.js";
import type { PointOfInterest } from "../gallery/PointOfInterest.js";

const webMapClientUrl =
  "/3dcitydb-client/3dwebclient/index.html?splashWindow=url%3D%26showOnStart%3Dfalse";
const defaultBounds = {
  minLon: -73.96126631673134,
  minLat: 40.70845429139645,
  maxLon: -73.87090923063519,
  maxLat: 40.79029679510656,
};

/**
 * Coordinates all Cesium side effects for the gallery, including iframe startup,
 * dataset loading, POI entities, route drawing, camera focus and panorama mode.
 */
export class GalleryMapStore {
  readonly iframeUrl = webMapClientUrl;

  isReady = false;

  isDatasetLoaded = false;

  isPanoramaActive = false;

  private frameElement: HTMLIFrameElement | null = null;

  private tileset: any = null;

  private poiDataSource: any = null;

  private routeDataSource: any = null;

  private panoramaTimer = 0;

  private panoramaHeading = 0;

  private readonly focus = new FocusController(defaultBounds);

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  /**
   * Registers the iframe element that hosts the 3DCityDB client and wires its
   * load event to the map initialization sequence managed by this store.
   */
  setFrameElement(element: HTMLIFrameElement | null): void {
    if (!element || this.frameElement === element) return;
    this.frameElement = element;
    element.addEventListener("load", () => {
      void this.initialize();
    });
  }

  /**
   * Waits for the embedded Cesium client, applies base map settings and loads
   * the DA10 3D Tiles dataset before marking the map as ready.
   */
  async initialize(): Promise<void> {
    const frameWindow = await this.waitForClient();
    this.applySatelliteMode(frameWindow);
    await this.loadDataset(frameWindow);
    runInAction(() => {
      this.isReady = true;
    });
  }

  /**
   * Renders the gallery points and route, focuses the complete point set and
   * starts the pre-tour orbit around the current gallery extent.
   */
  async showGallery(points: PointOfInterest[]): Promise<void> {
    const frameWindow = await this.waitForClient();
    await this.renderPoints(frameWindow, points);
    await this.renderRoute(frameWindow, points);
    this.focus.focusBounds(frameWindow, this.focus.boundsForPoints(points));
    this.startPanorama(points);
  }

  /**
   * Stops the panorama orbit and delegates the camera transition to the focus
   * controller for the selected point of interest.
   */
  async focusPoint(point: PointOfInterest): Promise<void> {
    this.stopPanorama();
    await this.focus.flyToPoint(this.frameWindow(), point);
  }

  /**
   * Starts a timer-driven Cesium camera orbit around the center of all gallery
   * points using a fixed target and range instead of drifting camera rotation.
   */
  startPanorama(points: PointOfInterest[]): void {
    const frameWindow = this.frameWindow();
    const Cesium = (frameWindow as any)?.Cesium;
    const viewer = (frameWindow as any)?.cesiumViewer;
    if (!Cesium?.Cartesian3 || !Cesium?.HeadingPitchRange || !viewer?.camera || this.panoramaTimer) {
      return;
    }

    const bounds = this.focus.boundsForPoints(points);
    const centerLon = (bounds.minLon + bounds.maxLon) / 2;
    const centerLat = (bounds.minLat + bounds.maxLat) / 2;
    const latSpanMeters = (bounds.maxLat - bounds.minLat) * 111320;
    const lonSpanMeters =
      (bounds.maxLon - bounds.minLon) *
      Math.max(111320 * Math.cos((centerLat * Math.PI) / 180), 1);
    const range = Math.max(1800, Math.max(latSpanMeters, lonSpanMeters) * 2.4);
    const center = Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 90);
    const pitch = Cesium.Math.toRadians(-36);

    this.panoramaHeading = 0;
    this.isPanoramaActive = true;
    this.panoramaTimer = window.setInterval(() => {
      this.panoramaHeading += 0.003;
      viewer.camera.lookAt(
        center,
        new Cesium.HeadingPitchRange(this.panoramaHeading, pitch, range),
      );
      viewer.scene?.requestRender?.();
    }, 50);
  }

  /**
   * Stops the active panorama timer and resets the Cesium camera transform so
   * subsequent manual and programmatic camera moves use the global reference.
   */
  stopPanorama(): void {
    if (this.panoramaTimer) {
      window.clearInterval(this.panoramaTimer);
      this.panoramaTimer = 0;
    }
    const Cesium = (this.frameWindow() as any)?.Cesium;
    const viewer = (this.frameWindow() as any)?.cesiumViewer;
    if (Cesium?.Matrix4 && viewer?.camera) {
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }
    this.isPanoramaActive = false;
  }

  private frameWindow(): Window | null {
    return this.frameElement?.contentWindow || null;
  }

  private async waitForClient(): Promise<Window> {
    const startedAt = performance.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        const frameWindow = this.frameWindow();
        const candidate = frameWindow as any;
        if (candidate?.Cesium?.Cesium3DTileset && candidate?.cesiumViewer) {
          resolve(frameWindow as Window);
          return;
        }
        if (performance.now() - startedAt > 15000) {
          reject(new Error("El cliente 3DCityDB todavia esta cargando."));
          return;
        }
        window.setTimeout(check, 250);
      };
      check();
    });
  }

  private applySatelliteMode(frameWindow: Window): void {
    const Cesium = (frameWindow as any).Cesium;
    const viewer = (frameWindow as any).cesiumViewer;
    if (!Cesium || !viewer) return;

    viewer.scene.globe.show = true;
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#050706");
    viewer.scene.skyBox && (viewer.scene.skyBox.show = true);
    viewer.scene.skyAtmosphere && (viewer.scene.skyAtmosphere.show = true);
    viewer.scene.requestRender?.();
  }

  private async loadDataset(frameWindow: Window): Promise<void> {
    if (this.isDatasetLoaded) return;

    const Cesium = (frameWindow as any).Cesium;
    const viewer = (frameWindow as any).cesiumViewer;
    const url = "/api/citydb/3dtiles/tileset.json?parts=NYC_DA10";
    const tileset =
      typeof Cesium.Cesium3DTileset.fromUrl === "function"
        ? await Cesium.Cesium3DTileset.fromUrl(url, { maximumScreenSpaceError: 2 })
        : new Cesium.Cesium3DTileset({ url, maximumScreenSpaceError: 2 });

    this.tileset = viewer.scene.primitives.add(tileset);
    if (this.tileset.readyPromise) await this.tileset.readyPromise;
    viewer.scene.requestRender?.();
    runInAction(() => {
      this.isDatasetLoaded = true;
    });
  }

  private async renderPoints(frameWindow: Window, points: PointOfInterest[]): Promise<void> {
    const Cesium = (frameWindow as any).Cesium;
    const viewer = (frameWindow as any).cesiumViewer;
    if (!Cesium?.CustomDataSource || !viewer?.dataSources) return;

    if (this.poiDataSource) viewer.dataSources.remove(this.poiDataSource, true);
    const dataSource = new Cesium.CustomDataSource("Gallery POIs");
    for (const point of points) {
      dataSource.entities.add({
        id: point.id,
        name: point.name,
        position: Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, 38),
        point: {
          pixelSize: 12,
          color: Cesium.Color.fromCssColorString("#d9e794"),
          outlineColor: Cesium.Color.BLACK.withAlpha(0.7),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: point.name,
          font: "600 13px Inter, Segoe UI, sans-serif",
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -22),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }
    this.poiDataSource = await viewer.dataSources.add(dataSource);
    viewer.scene.requestRender?.();
  }

  private async renderRoute(frameWindow: Window, points: PointOfInterest[]): Promise<void> {
    const Cesium = (frameWindow as any).Cesium;
    const viewer = (frameWindow as any).cesiumViewer;
    if (!Cesium?.CustomDataSource || points.length < 2) return;

    if (this.routeDataSource) viewer.dataSources.remove(this.routeDataSource, true);
    const route = new Cesium.CustomDataSource("Gallery Route");
    route.entities.add({
      id: "gallery-route",
      polyline: {
        positions: points.map((point) =>
          Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, 32),
        ),
        width: 4,
        material: Cesium.Color.fromCssColorString("#d9e794").withAlpha(0.9),
        clampToGround: true,
      },
    });
    this.routeDataSource = await viewer.dataSources.add(route);
    viewer.scene.requestRender?.();
  }
}
