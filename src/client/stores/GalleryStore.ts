import { makeAutoObservable, runInAction } from "mobx";
import type { PointOfInterest } from "../gallery/PointOfInterest.js";
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

  constructor(private readonly mapStore: GalleryMapStore) {
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
   * Updates the selected point identifier and tells the map store to focus the
   * chosen location using its Cesium side-effect method.
   */
  selectPoint(pointId: string): void {
    this.selectedPointId = pointId;
    this.currentImageIndex = 0;
    this.stopCarousel();
    const point = this.selectedPoint;
    if (!point) return;
    this.status = `Punto seleccionado: ${point.name}.`;
    void this.mapStore.focusPoint(point);
  }

  /**
   * Marks the gallery as an active tour and moves the camera to the current
   * selected point, defaulting to the first point when needed.
   */
  startTour(): void {
    if (this.points.length === 0) return;
    this.isTourStarted = true;
    this.isTourFinished = false;
    this.currentImageIndex = 0;
    const point = this.selectedPoint || this.points[0];
    this.selectedPointId = point.id;
    this.status = point ? `Recorrido iniciado en ${point.name}.` : "Recorrido iniciado.";
    this.restartCarousel(point);
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
    void this.mapStore.focusTourPoint(nextPoint);
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
