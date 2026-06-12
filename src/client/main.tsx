import { createRoot } from "react-dom/client";
import { GalleryApp } from "./app/GalleryApp.js";
import { GalleryMapStore } from "./stores/GalleryMapStore.js";
import { GalleryStore } from "./stores/GalleryStore.js";

const mapStore = new GalleryMapStore();
const galleryStore = new GalleryStore(mapStore);
const rootElement = document.querySelector("#root");

if (!rootElement) {
  throw new Error("Missing React root element.");
}

createRoot(rootElement).render(
  <GalleryApp galleryStore={galleryStore} mapStore={mapStore} />,
);

void galleryStore.bootstrap();
