import { observer } from "mobx-react-lite";
import type { SqlQueryStore } from "../query/SqlQueryStore.js";
import type { GalleryMapStore } from "../stores/GalleryMapStore.js";
import type { GalleryStore } from "../stores/GalleryStore.js";
import { GalleryMap } from "./GalleryMap.js";
import { GalleryPanel } from "./GalleryPanel.js";

interface GalleryAppProps {
  galleryStore: GalleryStore;
  mapStore: GalleryMapStore;
  queryStore: SqlQueryStore;
}

function GalleryAppView({ galleryStore, mapStore, queryStore }: GalleryAppProps) {
  return (
    <main className="gallery-shell">
      <GalleryMap mapStore={mapStore} />
      <GalleryPanel galleryStore={galleryStore} mapStore={mapStore} queryStore={queryStore} />
    </main>
  );
}

/**
 * Presents the gallery application layout by composing the map workspace and
 * visit list while all mutable state remains inside MobX stores.
 */
export const GalleryApp = observer(GalleryAppView);
