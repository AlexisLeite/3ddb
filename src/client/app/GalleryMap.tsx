import { observer } from "mobx-react-lite";
import type { GalleryMapStore } from "../stores/GalleryMapStore.js";

interface GalleryMapProps {
  mapStore: GalleryMapStore;
}

function GalleryMapView({ mapStore }: GalleryMapProps) {
  return (
    <section className="gallery-map" aria-label="Mapa de la galeria virtual">
      <iframe
        ref={mapStore.setFrameElement}
        className="gallery-iframe"
        src={mapStore.iframeUrl}
        title="Cliente de mapa 3DCityDB"
        allowFullScreen
      />
      <div className="map-badge">
        <span>{mapStore.isPanoramaActive ? "Panorama activo" : "Recorrido manual"}</span>
      </div>
    </section>
  );
}

/**
 * Presents the embedded Cesium web map frame and passive map status without
 * owning any local state or lifecycle effects inside the component.
 */
export const GalleryMap = observer(GalleryMapView);
