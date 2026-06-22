import { createRoot } from "react-dom/client";
import { GalleryApp } from "./app/GalleryApp.js";
import { SqlQueryStore } from "./query/SqlQueryStore.js";
import { GalleryMapStore } from "./stores/GalleryMapStore.js";
import { GalleryStore } from "./stores/GalleryStore.js";

const mapStore = new GalleryMapStore();
const queryStore = new SqlQueryStore(mapStore);
const galleryStore = new GalleryStore(mapStore, queryStore);
const rootElement = document.querySelector("#root");

if (!rootElement) {
  throw new Error("Missing React root element.");
}

createRoot(rootElement).render(
  <GalleryApp galleryStore={galleryStore} mapStore={mapStore} queryStore={queryStore} />,
);

void galleryStore.bootstrap();
