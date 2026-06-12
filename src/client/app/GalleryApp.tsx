import { observer } from "mobx-react-lite";
import type { GalleryMapStore } from "../stores/GalleryMapStore.js";
import type { GalleryStore } from "../stores/GalleryStore.js";
import { GalleryMap } from "./GalleryMap.js";
import { GalleryPanel } from "./GalleryPanel.js";

interface GalleryAppProps {
  galleryStore: GalleryStore;
  mapStore: GalleryMapStore;
}

function GalleryAppView({ galleryStore, mapStore }: GalleryAppProps) {
  return (
    <main className="gallery-shell">
      <GalleryMap mapStore={mapStore} />
      <GalleryPanel galleryStore={galleryStore} mapStore={mapStore} />
    </main>
  );
}

/**
 * Presents the gallery application layout by composing the map workspace and
 * visit list while all mutable state remains inside MobX stores.
 */
export const GalleryApp = observer(GalleryAppView);
