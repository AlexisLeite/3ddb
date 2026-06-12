import { makeAutoObservable, runInAction } from "mobx";
import type { PointOfInterest } from "../gallery/PointOfInterest.js";
import { RoutePlanner } from "../routing/RoutePlanner.js";
import type { GalleryMapStore } from "./GalleryMapStore.js";

interface RawGalleryPoint {
  nombre: string;
  imagen: string;
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

  status = "Cargando puntos de interes...";

  private readonly routePlanner = new RoutePlanner();

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
    this.isTourStarted = true;
    const point = this.selectedPoint || this.points[0];
    this.status = point ? `Recorrido iniciado en ${point.name}.` : "Recorrido iniciado.";
    if (point) {
      void this.mapStore.focusPoint(point);
    }
  }

  private normalizePoint(rawPoint: RawGalleryPoint, index: number): PointOfInterest {
    return {
      id: `poi-${index + 1}`,
      name: rawPoint.nombre,
      imageUrl: rawPoint.imagen,
      latitude: rawPoint.coordenadas_geograficas.latitud,
      longitude: rawPoint.coordenadas_geograficas.longitud,
      address: rawPoint.numero_de_calle,
      summary: rawPoint.resumen_del_lugar,
    };
  }
}
