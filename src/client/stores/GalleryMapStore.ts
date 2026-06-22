import { makeAutoObservable, runInAction } from "mobx";
import { CesiumPerformanceSettings } from "./CesiumPerformanceSettings.js";
import { FocusController } from "../focus/FocusController.js";
import type { PointOfInterest } from "../gallery/PointOfInterest.js";
import { replaceDatasetTileset } from "../map/replaceDatasetTileset.js";
import { GalleryCameraController } from "./GalleryCameraController.js";

const webMapClientUrl =
  "/3dcitydb-client/3dwebclient/index.html?splashWindow=url%3D%26showOnStart%3Dfalse";
const defaultBounds = {
  minLon: -73.96126631673134,
  minLat: 40.70845429139645,
  maxLon: -73.87090923063519,
  maxLat: 40.79029679510656,
};

/**
 * Coordinates iframe startup, dataset loading and Cesium entity rendering while
 * delegating all automatic camera movement to the gallery camera controller.
 */
export class GalleryMapStore {
  readonly iframeUrl = webMapClientUrl;

  isReady = false;

  isDatasetLoaded = false;

  isPanoramaActive = false;

  activeQueryId: string | null = null;

  private frameElement: HTMLIFrameElement | null = null;

  private tileset: any = null;

  private poiDataSource: any = null;

  private routeDataSource: any = null;

  private readonly camera = new GalleryCameraController(
    new FocusController(defaultBounds),
    () => this.frameWindow(),
    (active) => {
      runInAction(() => {
        this.isPanoramaActive = active;
      });
    },
  );

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
    this.camera.bindInteractionHandlers(frameWindow);
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
    await this.camera.showGallery(points);
  }

  /**
   * Stops the panorama orbit and delegates the camera transition to the focus
   * controller for the selected point of interest.
   */
  async focusPoint(point: PointOfInterest): Promise<void> {
    await this.camera.focusPoint(point);
  }

  /**
   * Moves to the active tour stop while preserving continuous camera rotation
   * through the transition and subsequent orbit around the point.
   */
  async focusTourPoint(point: PointOfInterest): Promise<void> {
    await this.camera.focusTourPoint(point);
  }

  /**
   * Ends the guided tour, reframes all rendered points and resumes the broad
   * presentation orbit around the complete gallery route.
   */
  async finishTour(points: PointOfInterest[]): Promise<void> {
    await this.camera.finishTour(points);
  }

  /**
   * Reloads the 3D Tiles dataset with an optional SQL query identifier so the
   * visible buildings match the active tour stop query state.
   */
  async applySqlQuery(queryId: string | null): Promise<void> {
    if (this.activeQueryId === queryId && this.isDatasetLoaded) return;
    const frameWindow = await this.waitForClient();
    await this.replaceDataset(frameWindow, queryId);
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
    CesiumPerformanceSettings.applyToViewer(frameWindow);
    viewer.scene.requestRender?.();
  }

  private async loadDataset(frameWindow: Window): Promise<void> {
    if (this.isDatasetLoaded) return;
    await this.replaceDataset(frameWindow, this.activeQueryId);
  }

  private async replaceDataset(frameWindow: Window, queryId: string | null): Promise<void> {
    const partId = import.meta.env.VITE_DEFAULT_SELECTED_PART_ID || "NYC_DA1";
    const tileset = await replaceDatasetTileset(frameWindow, partId, queryId, this.tileset);
    runInAction(() => {
      this.tileset = tileset;
      this.activeQueryId = queryId;
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
