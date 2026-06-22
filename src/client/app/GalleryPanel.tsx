import { observer } from "mobx-react-lite";
import { SqlQueryPanel } from "../query/SqlQueryPanel.js";
import type { SqlQueryStore } from "../query/SqlQueryStore.js";
import type { GalleryMapStore } from "../stores/GalleryMapStore.js";
import type { GalleryStore } from "../stores/GalleryStore.js";

interface GalleryPanelProps {
  galleryStore: GalleryStore;
  mapStore: GalleryMapStore;
  queryStore: SqlQueryStore;
}

function GalleryPanelView({ galleryStore, mapStore, queryStore }: GalleryPanelProps) {
  const selectedPoint = galleryStore.selectedPoint;
  const panelClassName = [
    "gallery-panel",
    galleryStore.isTourStarted ? "is-touring" : "is-overview",
    galleryStore.isTourFinished ? "is-finished" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (galleryStore.isTourFinished) {
    return (
      <aside className={panelClassName} aria-label="Recorrido finalizado">
        <section className="tour-finished" aria-live="polite">
          <p className="panel-kicker">Recorrido finalizado</p>
          <h1>Gracias por visitar la galeria virtual.</h1>
          <p>{galleryStore.status}</p>
          <button type="button" onClick={galleryStore.returnToMenu}>
            Volver al menu inicial
          </button>
        </section>
      </aside>
    );
  }

  if (galleryStore.isTourStarted && selectedPoint) {
    return (
      <aside className={panelClassName} aria-label="Punto actual del recorrido">
        <section className="tour-stop" aria-label="Detalle del lugar actual">
          <div className="tour-stop-header">
            <p className="panel-kicker">
              Punto {galleryStore.points.indexOf(selectedPoint) + 1} de {galleryStore.points.length}
            </p>
            <div className="tour-stop-actions">
              <button
                type="button"
                onClick={galleryStore.previousTourPoint}
                disabled={!galleryStore.canGoPreviousPoint}
              >
                Anterior
              </button>
              <button type="button" onClick={galleryStore.nextTourPoint}>
                {galleryStore.isLastPoint ? "Finalizar recorrido" : "Siguiente"}
              </button>
            </div>
          </div>

          <figure className="poi-carousel">
            <img src={galleryStore.currentImageUrl} alt="" />
          </figure>

          <div className="poi-tour-data">
            <h1>{selectedPoint.name}</h1>
            <p className="poi-address">{selectedPoint.address}</p>
            <p>{selectedPoint.summary}</p>
          </div>

          <SqlQueryPanel point={selectedPoint} queryStore={queryStore} />
        </section>
      </aside>
    );
  }

  return (
    <aside className={panelClassName} aria-label="Recorrido de la galeria">
      <section className="tour-actions" aria-label="Estado del recorrido">
        <button type="button" onClick={galleryStore.startTour} disabled={galleryStore.isLoading}>
          Iniciar recorrido
        </button>
        <p className="panel-status">
          {galleryStore.status} {mapStore.isDatasetLoaded ? "3D Tiles activo." : "Cargando 3D Tiles."}
        </p>
      </section>

      <section className="poi-list" aria-label="Lugares a visitar">
        {galleryStore.points.map((point, index) => (
          <button
            type="button"
            key={point.id}
            className={point.id === galleryStore.selectedPointId ? "poi-item is-selected" : "poi-item"}
            onClick={() => galleryStore.startTourAtPoint(point.id)}
            disabled={galleryStore.isLoading}
          >
            <span className="poi-index">{index + 1}</span>
            <span>
              <strong>{point.name}</strong>
            </span>
          </button>
        ))}
      </section>
    </aside>
  );
}

/**
 * Presents tour controls, the ordered POI list and selected-place details while
 * delegating all state changes to MobX store methods.
 */
export const GalleryPanel = observer(GalleryPanelView);
