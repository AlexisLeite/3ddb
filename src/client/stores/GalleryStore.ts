import { makeAutoObservable, runInAction } from "mobx";
import type { PointOfInterest } from "../gallery/PointOfInterest.js";
import type { SqlQueryStore } from "../query/SqlQueryStore.js";
import { RoutePlanner } from "../routing/RoutePlanner.js";
import type { GalleryMapStore } from "./GalleryMapStore.js";

interface RawGalleryPoint {
  nombre: string;
  imagen: string;
  imagenes?: string[];
  coordenadas_geograficas: {
    latitud: number;
    longitud: number;
  };
  numero_de_calle: string;
  resumen_del_lugar: string;
}

/**
 * Owns gallery application state, loads the standard POI JSON format and calls
 * map-store effect methods when the tour changes or starts.
 */
export class GalleryStore {
  points: PointOfInterest[] = [];

  selectedPointId = "";

  isLoading = true;

  isTourStarted = false;

  isTourFinished = false;

  currentImageIndex = 0;

  status = "Cargando puntos de interes...";

  private readonly routePlanner = new RoutePlanner();

  private carouselTimer = 0;

  constructor(
    private readonly mapStore: GalleryMapStore,
    private readonly queryStore: SqlQueryStore,
  ) {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  /**
   * Returns the currently selected gallery point so presentational components
   * can render details without owning duplicated selection state.
   */
  get selectedPoint(): PointOfInterest | null {
    return this.points.find((point) => point.id === this.selectedPointId) || null;
  }

  /**
   * Indicates whether the current active point is the last stop in the tour so
   * the interface can turn the single action button into a finish command.
   */
  get isLastPoint(): boolean {
    return this.selectedPointIndex >= this.points.length - 1;
  }

  /**
   * Indicates whether the guided tour can move back to an earlier stop without
   * wrapping around or leaving the ordered route.
   */
  get canGoPreviousPoint(): boolean {
    return this.isTourStarted && this.selectedPointIndex > 0;
  }

  /**
   * Returns the selected point image for the carousel, clamping the index so
   * malformed or changing gallery data cannot point outside the image array.
   */
  get currentImageUrl(): string {
    const images = this.selectedPoint?.imageUrls || [];
    return images[Math.min(this.currentImageIndex, Math.max(images.length - 1, 0))] || "";
  }

  private get selectedPointIndex(): number {
    return this.points.findIndex((point) => point.id === this.selectedPointId);
  }

  /**
   * Loads the standard POI JSON file, normalizes it into application state and
   * asks the map store to render the complete gallery route.
   */
  async bootstrap(): Promise<void> {
    try {
      const response = await fetch("/data/gallery/edificios.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`No se pudo cargar la galeria (${response.status}).`);
      const rawPoints = (await response.json()) as RawGalleryPoint[];
      const points = this.routePlanner.plan(rawPoints.map(this.normalizePoint));
      runInAction(() => {
        this.points = points;
        this.selectedPointId = points[0]?.id || "";
        this.isLoading = false;
        this.isTourStarted = false;
        this.isTourFinished = false;
        this.currentImageIndex = 0;
        this.status = `${points.length} lugares listos para visitar.`;
      });
      await this.mapStore.showGallery(points);
    } catch (error) {
      runInAction(() => {
        this.isLoading = false;
        this.status = error instanceof Error ? error.message : "No se pudo cargar la galeria.";
      });
    }
  }

  /**
   * Marks the gallery as an active tour and moves the camera to the current
   * selected point, defaulting to the first point when needed.
   */
  startTour(): void {
    this.startTourAtPoint(this.selectedPointId);
  }

  /**
   * Starts the guided tour at a requested stop so the overview menu can jump
   * directly into any point of the ordered route.
   */
  startTourAtPoint(pointId: string): void {
    const point = this.points.find((candidate) => candidate.id === pointId) || this.points[0];
    if (!point) return;
    this.isTourStarted = true;
    this.isTourFinished = false;
    this.currentImageIndex = 0;
    this.selectedPointId = point.id;
    this.status = point ? `Recorrido iniciado en ${point.name}.` : "Recorrido iniciado.";
    this.restartCarousel(point);
    void this.queryStore.applyForPoint(point.id);
    void this.mapStore.focusTourPoint(point);
  }

  /**
   * Advances to the next tour stop and uses the final click on the last point
   * to close the guided visit with a stable thank-you state.
   */
  nextTourPoint(): void {
    if (!this.isTourStarted) {
      this.startTour();
      return;
    }

    if (this.isLastPoint) {
      this.finishTour();
      return;
    }

    const nextPoint = this.points[this.selectedPointIndex + 1];
    this.selectedPointId = nextPoint.id;
    this.currentImageIndex = 0;
    this.status = `Visitando ${nextPoint.name}.`;
    this.restartCarousel(nextPoint);
    void this.queryStore.applyForPoint(nextPoint.id);
    void this.mapStore.focusTourPoint(nextPoint);
  }

  /**
   * Moves the active guided-tour stop back one position while keeping the
   * carousel and Cesium camera synchronized with the selected place.
   */
  previousTourPoint(): void {
    if (!this.canGoPreviousPoint) return;

    const previousPoint = this.points[this.selectedPointIndex - 1];
    this.selectedPointId = previousPoint.id;
    this.currentImageIndex = 0;
    this.status = `Visitando ${previousPoint.name}.`;
    this.restartCarousel(previousPoint);
    void this.queryStore.applyForPoint(previousPoint.id);
    void this.mapStore.focusTourPoint(previousPoint);
  }

  /**
   * Leaves the final tour screen, clears SQL query state and restores the
   * initial overview menu so a new visit starts without rendered filters.
   */
  returnToMenu(): void {
    this.stopCarousel();
    this.isTourStarted = false;
    this.isTourFinished = false;
    this.selectedPointId = this.points[0]?.id || "";
    this.currentImageIndex = 0;
    this.status = `${this.points.length} lugares listos para visitar.`;
    this.queryStore.reset();
    void this.mapStore.finishTour(this.points);
  }

  private normalizePoint(rawPoint: RawGalleryPoint, index: number): PointOfInterest {
    const imageUrls = [rawPoint.imagen, ...(rawPoint.imagenes || [])].filter(Boolean);
    return {
      id: `poi-${index + 1}`,
      name: rawPoint.nombre,
      imageUrl: rawPoint.imagen,
      imageUrls,
      latitude: rawPoint.coordenadas_geograficas.latitud,
      longitude: rawPoint.coordenadas_geograficas.longitud,
      address: rawPoint.numero_de_calle,
      summary: rawPoint.resumen_del_lugar,
    };
  }

  private finishTour(): void {
    this.stopCarousel();
    this.isTourStarted = false;
    this.isTourFinished = true;
    this.status = "Gracias por recorrer la galeria virtual.";
    void this.queryStore.clearMapFilter();
    void this.mapStore.finishTour(this.points);
  }

  private restartCarousel(point: PointOfInterest): void {
    this.stopCarousel();
    if (point.imageUrls.length < 2) return;

    this.carouselTimer = window.setInterval(() => {
      runInAction(() => {
        this.currentImageIndex = (this.currentImageIndex + 1) % point.imageUrls.length;
      });
    }, 4200);
  }

  private stopCarousel(): void {
    if (!this.carouselTimer) return;
    window.clearInterval(this.carouselTimer);
    this.carouselTimer = 0;
  }
}
