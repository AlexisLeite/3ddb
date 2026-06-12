import { observer } from "mobx-react-lite";
import type { GalleryMapStore } from "../stores/GalleryMapStore.js";
import type { GalleryStore } from "../stores/GalleryStore.js";

interface GalleryPanelProps {
  galleryStore: GalleryStore;
  mapStore: GalleryMapStore;
}

function GalleryPanelView({ galleryStore, mapStore }: GalleryPanelProps) {
  const selectedPoint = galleryStore.selectedPoint;
  return (
    <aside className="gallery-panel" aria-label="Recorrido de la galeria">
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
            key={point.id}
            type="button"
            className={point.id === galleryStore.selectedPointId ? "poi-item is-selected" : "poi-item"}
            onClick={() => galleryStore.selectPoint(point.id)}
          >
            <span className="poi-index">{index + 1}</span>
            <span>
              <strong>{point.name}</strong>
              <small>{point.address}</small>
            </span>
          </button>
        ))}
      </section>

      {selectedPoint ? (
        <section className="poi-detail" aria-label="Detalle del lugar seleccionado">
          <img src={selectedPoint.imageUrl} alt="" />
          <h2>{selectedPoint.name}</h2>
          <p>{selectedPoint.summary}</p>
        </section>
      ) : null}
    </aside>
  );
}

/**
 * Presents tour controls, the ordered POI list and selected-place details while
 * delegating all state changes to MobX store methods.
 */
export const GalleryPanel = observer(GalleryPanelView);
