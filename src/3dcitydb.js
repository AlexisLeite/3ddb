function envString(name, fallback) {
  return import.meta.env[name] ?? fallback;
}

function envNumber(name, fallback) {
  const value = Number(import.meta.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function envBoolean(name, fallback) {
  const value = import.meta.env[name];
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

const WEB_MAP_CLIENT_URL = envString(
  "VITE_WEB_MAP_CLIENT_URL",
  "/3dcitydb-client/3dwebclient/index.html?splashWindow=url%3D%26showOnStart%3Dfalse",
);
const SATELLITE_IMAGERY_URL = envString(
  "VITE_SATELLITE_IMAGERY_URL",
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
);
const SATELLITE_IMAGERY_CREDIT = envString(
  "VITE_SATELLITE_IMAGERY_CREDIT",
  "Esri World Imagery",
);
const SATELLITE_IMAGERY_MAX_LEVEL = envNumber("VITE_SATELLITE_IMAGERY_MAX_LEVEL", 19);
const DEFAULT_SELECTED_PART_ID = envString("VITE_DEFAULT_SELECTED_PART_ID", "NYC_DA4");
const WEB_MAP_CLIENT_WAIT_MS = envNumber("VITE_WEB_MAP_CLIENT_WAIT_MS", 15000);
const TILESET_MAX_SCREEN_SPACE_ERROR = envNumber(
  "VITE_TILESET_MAX_SCREEN_SPACE_ERROR",
  2,
);
const TILESET_RENDER_WAIT_MS = envNumber("VITE_TILESET_RENDER_WAIT_MS", 60000);
const APPLY_TILE_STYLE = envBoolean("VITE_APPLY_TILE_STYLE", false);
const tileStyleColors = {
  roof: envString("VITE_TILE_COLOR_ROOF", "#e7ff38"),
  wall: envString("VITE_TILE_COLOR_WALL", "#d8ff42"),
  floor: envString("VITE_TILE_COLOR_FLOOR", "#c4f72f"),
  opening: envString("VITE_TILE_COLOR_OPENING", "#f2ff8a"),
  road: envString("VITE_TILE_COLOR_ROAD", "#baff3d"),
  edge: envString("VITE_TILE_COLOR_EDGE", "#171c12"),
  default: envString("VITE_TILE_COLOR_DEFAULT", "#dcff3f"),
};
const tileStyleAlpha = {
  roof: envNumber("VITE_TILE_ALPHA_ROOF", 0.96),
  wall: envNumber("VITE_TILE_ALPHA_WALL", 0.94),
  floor: envNumber("VITE_TILE_ALPHA_FLOOR", 0.92),
  opening: envNumber("VITE_TILE_ALPHA_OPENING", 0.96),
  road: envNumber("VITE_TILE_ALPHA_ROAD", 0.9),
  edge: envNumber("VITE_TILE_ALPHA_EDGE", 1),
  default: envNumber("VITE_TILE_ALPHA_DEFAULT", 0.94),
};

function requiredElement(selector) {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Missing required DOM element: ${selector}`);
  }
  return element;
}

const partsList = requiredElement("#webmapPartsList");
const selectAllButton = requiredElement("#webmapSelectAll");
const clearButton = requiredElement("#webmapClear");
const tilesetUrl = requiredElement("#tilesetUrl");
const sqlWhere = requiredElement("#sqlWhere");
const applySqlFilterButton = requiredElement("#applySqlFilter");
const clearSqlFilterButton = requiredElement("#clearSqlFilter");
const copyButton = requiredElement("#copyTilesetUrl");
const loadLayerButton = requiredElement("#loadWebmapLayer");
const flyToButton = requiredElement("#flyToWebmapLayer");
const openButton = requiredElement("#openWebMapClient");
const statusEl = requiredElement("#webmapStatus");
const webmapFrame = requiredElement("#webmapFrame");
const loadLayerButtonText = loadLayerButton.textContent;
const applySqlFilterButtonText = applySqlFilterButton.textContent;

let partsById = new Map();
let loadedTileset = null;
let loadedPartKey = "";
let renderRecoveryScene = null;
let activeLoadController = null;
let activeLoadId = 0;
let pendingPartSelection = null;
let isLayerLoading = false;

function selectedPartIds() {
  return [...partsList.querySelectorAll("input[type='checkbox']:checked")].map(
    (input) => input.value,
  );
}

function partCheckboxes() {
  return [...partsList.querySelectorAll("input[type='checkbox']")];
}

function currentSqlWhere() {
  return sqlWhere.value.trim();
}

function setStatus(message, isLoading = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-loading", isLoading);
  statusEl.setAttribute("aria-busy", isLoading ? "true" : "false");
}

function updateControlState() {
  const hasParts = selectedPartIds().length > 0;

  copyButton.disabled = !hasParts || isLayerLoading;
  loadLayerButton.disabled = !hasParts || isLayerLoading;
  applySqlFilterButton.disabled = !hasParts || isLayerLoading;
  flyToButton.disabled = !hasParts || isLayerLoading;
  clearSqlFilterButton.disabled = isLayerLoading;
  selectAllButton.disabled = isLayerLoading;
  clearButton.disabled = isLayerLoading;
  sqlWhere.disabled = isLayerLoading;

  loadLayerButton.textContent = isLayerLoading ? "Cargando..." : loadLayerButtonText;
  applySqlFilterButton.textContent = isLayerLoading
    ? "Aplicando..."
    : applySqlFilterButtonText;
}

function setLayerLoading(isLoading, message = "") {
  isLayerLoading = isLoading;
  updateControlState();
  if (message) {
    setStatus(message, isLoading);
  } else if (!isLoading) {
    statusEl.classList.remove("is-loading");
    statusEl.setAttribute("aria-busy", "false");
  }
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function abortError() {
  return new DOMException("Load aborted", "AbortError");
}

function addCesiumEventListener(event, listener) {
  if (!event?.addEventListener) return null;

  const remove = event.addEventListener(listener);
  if (typeof remove === "function") return remove;

  return () => event.removeEventListener?.(listener);
}

function waitForCesiumFrames(frameWindow, frameCount = 2) {
  const postRender = frameWindow?.cesiumViewer?.scene?.postRender;
  if (!postRender?.addEventListener) {
    return new Promise((resolve) => window.setTimeout(resolve, 80));
  }

  return new Promise((resolve) => {
    let remainingFrames = frameCount;
    const remove = addCesiumEventListener(postRender, () => {
      remainingFrames -= 1;
      if (remainingFrames <= 0) {
        remove?.();
        resolve();
      }
    });

    frameWindow.cesiumViewer?.scene?.requestRender?.();
  });
}

function waitForTilesetInitialRender(frameWindow, tileset, signal) {
  if (signal?.aborted) {
    return Promise.reject(abortError());
  }

  return new Promise((resolve, reject) => {
    const cleanups = [];
    let settled = false;
    let sawLoadProgress = false;

    const cleanup = () => {
      for (const remove of cleanups.splice(0)) {
        remove?.();
      }
    };

    const finish = async () => {
      if (settled) return;
      settled = true;
      cleanup();
      await waitForCesiumFrames(frameWindow, 2);
      resolve();
    };

    const failAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(abortError());
    };

    const timeoutId = window.setTimeout(finish, TILESET_RENDER_WAIT_MS);
    cleanups.push(() => window.clearTimeout(timeoutId));

    if (signal) {
      signal.addEventListener("abort", failAbort, { once: true });
      cleanups.push(() => signal.removeEventListener("abort", failAbort));
    }

    const eventRemovers = [
      addCesiumEventListener(tileset.tileVisible, finish),
      addCesiumEventListener(tileset.initialTilesLoaded, finish),
      addCesiumEventListener(tileset.allTilesLoaded, finish),
      addCesiumEventListener(tileset.loadProgress, (pendingRequests, tilesProcessing) => {
        if (pendingRequests > 0 || tilesProcessing > 0) {
          sawLoadProgress = true;
          return;
        }

        if (sawLoadProgress) {
          finish();
        }
      }),
    ].filter(Boolean);

    cleanups.push(...eventRemovers);

    if (eventRemovers.length === 0) {
      window.setTimeout(finish, 600);
    }
  });
}

function partInputFromEvent(event) {
  const target = event.target;
  if (!(target instanceof Element)) return null;

  if (target instanceof HTMLInputElement && target.type === "checkbox") {
    return target;
  }

  return target
    .closest(".part-check")
    ?.querySelector("input[type='checkbox']") || null;
}

function updateTilesetUrl() {
  const partIds = selectedPartIds();
  const url = selectedTilesetUrl();

  tilesetUrl.value = url || "";
  updateControlState();
  if (!isLayerLoading) {
    setStatus(
      partIds.length > 0
        ? `${partIds.length} parte${partIds.length === 1 ? "" : "s"} seleccionada${partIds.length === 1 ? "" : "s"}; la capa se cargara como 3D Tiles desde 3DCityDB${currentSqlWhere() ? " con filtro SQL" : ""}.`
        : "Selecciona al menos una zona importada de NYC.",
    );
  }
}

function selectedBounds() {
  return boundsForPartIds(selectedPartIds());
}

function boundsForPartIds(partIds) {
  const bounds = partIds
    .map((partId) => partsById.get(partId)?.bounds)
    .filter(Boolean)
    .reduce(
      (acc, partBounds) => ({
        minLon: Math.min(acc.minLon, partBounds.minLon),
        minLat: Math.min(acc.minLat, partBounds.minLat),
        maxLon: Math.max(acc.maxLon, partBounds.maxLon),
        maxLat: Math.max(acc.maxLat, partBounds.maxLat),
      }),
      {
        minLon: Infinity,
        minLat: Infinity,
        maxLon: -Infinity,
        maxLat: -Infinity,
      },
    );

  return Number.isFinite(bounds.minLon) ? bounds : null;
}

function tilesetUrlForPartIds(partIds) {
  if (partIds.length === 0) return null;

  const url = new URL("/api/citydb/3dtiles/tileset.json", window.location.origin);
  url.searchParams.set("parts", partIds.join(","));
  const where = currentSqlWhere();
  if (where) {
    url.searchParams.set("where", where);
  }
  return url.toString();
}

function selectedTilesetUrl() {
  return tilesetUrlForPartIds(selectedPartIds());
}

function cameraForBounds(bounds) {
  const longitude = (bounds.minLon + bounds.maxLon) / 2;
  const latitude = (bounds.minLat + bounds.maxLat) / 2;
  const latSpanMeters = (bounds.maxLat - bounds.minLat) * 111320;
  const lonSpanMeters =
    (bounds.maxLon - bounds.minLon) *
    Math.max(111320 * Math.cos((latitude * Math.PI) / 180), 1);
  const height = Math.max(900, Math.min(Math.max(latSpanMeters, lonSpanMeters) * 1.8, 24000));

  return {
    longitude,
    latitude,
    height,
    heading: 0,
    pitch: -55,
    roll: 0,
  };
}

function clientUrlWithCamera(camera) {
  const url = new URL(WEB_MAP_CLIENT_URL, window.location.origin);
  url.searchParams.set("longitude", camera.longitude.toFixed(8));
  url.searchParams.set("latitude", camera.latitude.toFixed(8));
  url.searchParams.set("height", Math.round(camera.height).toString());
  url.searchParams.set("heading", camera.heading.toString());
  url.searchParams.set("pitch", camera.pitch.toString());
  url.searchParams.set("roll", camera.roll.toString());
  return url;
}

function waitForWebMapClient() {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();

    function check() {
      const frameWindow = webmapFrame.contentWindow;
      if (
        frameWindow?.Cesium &&
        frameWindow?.Cesium?.Cesium3DTileset &&
        frameWindow?.webMap &&
        frameWindow?.cesiumViewer
      ) {
        closeSplashWindow(frameWindow);
        applySatelliteMode(frameWindow);
        resolve(frameWindow);
        return;
      }

      if (performance.now() - startedAt > WEB_MAP_CLIENT_WAIT_MS) {
        reject(new Error("El cliente de mapa 3DCityDB todavia esta cargando."));
        return;
      }

      window.setTimeout(check, 250);
    }

    check();
  });
}

function applySatelliteMode(frameWindow) {
  const Cesium = frameWindow.Cesium;
  const viewer = frameWindow.cesiumViewer;
  if (!Cesium || !viewer) return;

  viewer.useDefaultRenderLoop = true;
  viewer.scene.globe.show = true;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#050706");

  if (viewer.scene.skyBox) viewer.scene.skyBox.show = true;
  if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
  if (viewer.scene.sun) viewer.scene.sun.show = true;
  if (viewer.scene.moon) viewer.scene.moon.show = true;

  if (viewer.__citydbImageryUrl !== SATELLITE_IMAGERY_URL) {
    viewer.imageryLayers.removeAll(false);
    viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: SATELLITE_IMAGERY_URL,
        credit: SATELLITE_IMAGERY_CREDIT,
        maximumLevel: SATELLITE_IMAGERY_MAX_LEVEL,
      }),
    );
    viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
    viewer.__citydbImageryUrl = SATELLITE_IMAGERY_URL;
  }

  viewer.scene.requestRender?.();
}

function installRenderRecovery(frameWindow) {
  const viewer = frameWindow?.cesiumViewer;
  const scene = viewer?.scene;
  if (!viewer || !scene?.renderError) return;
  if (renderRecoveryScene === scene) return;

  scene.rethrowRenderErrors = false;
  scene.renderError.addEventListener((_scene, error) => {
    console.error(error);
    viewer.useDefaultRenderLoop = true;

    if (loadedTileset) {
      viewer.scene.primitives.remove(loadedTileset);
      loadedTileset = null;
      loadedPartKey = "";
    }

    setLayerLoading(false);
    setStatus(
      "Cesium rechazo el payload de 3D Tiles y se quito la capa. Vuelve a cargar la capa seleccionada.",
    );
  });
  renderRecoveryScene = scene;
}

function closeSplashWindow(frameWindow) {
  try {
    frameWindow.splashController?.closeSplashWindow(frameWindow.jQuery);
    applySatelliteMode(frameWindow);
  } catch {
    // The splash controller belongs to the embedded client and can be absent during startup.
  }
}

function removeLoadedTileset(frameWindow) {
  const primitives = frameWindow?.cesiumViewer?.scene?.primitives;
  if (loadedTileset && primitives) {
    primitives.remove(loadedTileset);
  }
  loadedTileset = null;
  loadedPartKey = "";
}

async function createTileset(frameWindow, url) {
  const Cesium = frameWindow.Cesium;
  const options = {
    url,
    maximumScreenSpaceError: TILESET_MAX_SCREEN_SPACE_ERROR,
  };

  if (typeof Cesium.Cesium3DTileset.fromUrl === "function") {
    return Cesium.Cesium3DTileset.fromUrl(url, {
      maximumScreenSpaceError: options.maximumScreenSpaceError,
    });
  }

  return new Cesium.Cesium3DTileset(options);
}

async function validateTilesetUrl(url, signal) {
  const response = await fetch(url, {
    cache: "no-store",
    signal,
  });

  if (response.ok) return;

  let message = `No se pudo cargar el manifiesto de 3D Tiles (${response.status}).`;
  try {
    const body = await response.json();
    if (body?.error) {
      message = body.error;
    }
  } catch {
    // Keep the status-based message if the server did not send JSON.
  }

  throw new Error(message);
}

function styleTileset(frameWindow, tileset) {
  if (!APPLY_TILE_STYLE) return;

  const Cesium = frameWindow.Cesium;
  if (!Cesium?.Cesium3DTileStyle) return;

  tileset.style = new Cesium.Cesium3DTileStyle({
    color: {
      conditions: [
        [
          "${surfaceType} === 'edge'",
          `color('${tileStyleColors.edge}', ${tileStyleAlpha.edge})`,
        ],
        [
          "${surfaceType} === 'roof'",
          `color('${tileStyleColors.roof}', ${tileStyleAlpha.roof})`,
        ],
        [
          "${surfaceType} === 'wall'",
          `color('${tileStyleColors.wall}', ${tileStyleAlpha.wall})`,
        ],
        [
          "${surfaceType} === 'floor'",
          `color('${tileStyleColors.floor}', ${tileStyleAlpha.floor})`,
        ],
        [
          "${surfaceType} === 'opening'",
          `color('${tileStyleColors.opening}', ${tileStyleAlpha.opening})`,
        ],
        [
          "${surfaceType} === 'road'",
          `color('${tileStyleColors.road}', ${tileStyleAlpha.road})`,
        ],
        [
          "true",
          `color('${tileStyleColors.default}', ${tileStyleAlpha.default})`,
        ],
      ],
    },
  });
}

async function loadSelectedLayerInWebMap() {
  const partIds = selectedPartIds();
  const url = selectedTilesetUrl();

  if (partIds.length === 0 || !url) {
    setStatus("Selecciona al menos una zona importada de NYC.");
    return;
  }

  activeLoadController?.abort();
  const loadController = new AbortController();
  const loadId = activeLoadId + 1;
  activeLoadController = loadController;
  activeLoadId = loadId;

  setLayerLoading(
    true,
    currentSqlWhere()
      ? "Ejecutando filtro SQL y cargando capa 3D Tiles desde 3DCityDB..."
      : "Cargando capa 3D Tiles desde 3DCityDB...",
  );
  await waitForNextPaint();

  try {
    await validateTilesetUrl(url, loadController.signal);
    if (loadController.signal.aborted || loadId !== activeLoadId) return;

    const frameWindow = await waitForWebMapClient();
    if (loadController.signal.aborted || loadId !== activeLoadId) return;

    applySatelliteMode(frameWindow);
    installRenderRecovery(frameWindow);

    removeLoadedTileset(frameWindow);
    frameWindow.cesiumViewer.dataSources.removeAll(true);

    const tileset = await createTileset(frameWindow, url);
    if (loadController.signal.aborted || loadId !== activeLoadId) return;

    loadedTileset = frameWindow.cesiumViewer.scene.primitives.add(tileset);
    loadedPartKey = partIds.join(",");
    styleTileset(frameWindow, loadedTileset);
    const initialRenderPromise = waitForTilesetInitialRender(
      frameWindow,
      loadedTileset,
      loadController.signal,
    );
    initialRenderPromise.catch(() => {});
    if (loadedTileset.readyPromise) {
      await loadedTileset.readyPromise;
    }
    setStatus("Descargando y renderizando tiles iniciales...", true);
    await frameWindow.cesiumViewer.flyTo(loadedTileset);
    if (loadController.signal.aborted || loadId !== activeLoadId) return;

    await initialRenderPromise;
    if (loadController.signal.aborted || loadId !== activeLoadId) return;

    applySatelliteMode(frameWindow);

    setStatus(
      `Capa 3D Tiles cargada para ${partIds.length} parte${partIds.length === 1 ? "" : "s"} de NYC desde 3DCityDB.`,
    );
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    console.error(error);
    setStatus(error.message);
  } finally {
    if (activeLoadController === loadController) {
      activeLoadController = null;
    }
    if (loadId === activeLoadId) {
      setLayerLoading(false);
    }
  }
}

async function flyToSelectedParts() {
  const bounds = selectedBounds();
  if (!bounds) {
    setStatus("Selecciona al menos una zona importada de NYC.");
    return;
  }

  const selectedPartKey = selectedPartIds().join(",");
  if (!loadedTileset || loadedPartKey !== selectedPartKey) {
    await loadSelectedLayerInWebMap();
    return;
  }

  const camera = cameraForBounds(bounds);
  const frameWindow = webmapFrame.contentWindow;
  const Cesium = frameWindow?.Cesium;
  const cesiumViewer = frameWindow?.cesiumViewer;

  if (Cesium && cesiumViewer?.camera && loadedTileset) {
    applySatelliteMode(frameWindow);
    await cesiumViewer.flyTo(loadedTileset, {
      duration: 0.9,
      offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(camera.heading),
        Cesium.Math.toRadians(camera.pitch),
        camera.height,
      ),
    });
  } else {
    webmapFrame.src = clientUrlWithCamera(camera).toString();
  }

  setStatus("Moviendo la camara a la capa de NYC cargada.");
}

function clearLoadedLayer() {
  activeLoadController?.abort();
  activeLoadController = null;
  activeLoadId += 1;
  setLayerLoading(false);

  removeLoadedTileset(webmapFrame.contentWindow);
}

function setOnlyPartChecked(input) {
  for (const checkbox of partCheckboxes()) {
    checkbox.checked = checkbox === input;
  }
}

function handlePartPointerDown(event) {
  const input = partInputFromEvent(event);
  pendingPartSelection = input
    ? {
      input,
      additive: event.ctrlKey || event.metaKey,
    }
    : null;
}

function setAllPartsChecked(checked) {
  const inputs = partCheckboxes();
  for (const input of inputs) {
    input.checked = false;
  }

  if (checked) {
    const firstImported = inputs.find((input) => input.dataset.imported === "true");
    if (firstImported) {
      firstImported.checked = true;
    }
  } else {
    clearLoadedLayer();
  }

  updateTilesetUrl();
  if (checked && selectedPartIds().length > 0) {
    loadSelectedLayerInWebMap();
  }
}

function handlePartSelectionChange(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") return;
  if (input.disabled || input.dataset.imported !== "true") return;

  const isAdditiveSelection =
    pendingPartSelection?.input === input && pendingPartSelection.additive;
  pendingPartSelection = null;

  if (!isAdditiveSelection) {
    setOnlyPartChecked(input);
  }

  updateTilesetUrl();
  if (selectedPartIds().length > 0) {
    loadSelectedLayerInWebMap();
  } else {
    clearLoadedLayer();
  }
}

function populateParts(parts) {
  partsList.replaceChildren(
    ...parts.map((part) => {
      const label = document.createElement("label");
      label.className = "part-check";
      label.title = part.imported
        ? `${part.stats.buildings.toLocaleString("es-UY")} edificios`
        : "Todavia no importada";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = part.id;
      input.dataset.imported = String(part.imported);
      input.checked = part.id === DEFAULT_SELECTED_PART_ID && part.imported;
      input.disabled = !part.imported;

      const name = document.createElement("span");
      name.className = "part-name";
      name.textContent = part.label;

      label.append(input, name);
      return label;
    }),
  );
}

async function loadParts() {
  const response = await fetch("/api/citydb/cities");
  if (!response.ok) {
    throw new Error("No se pudo cargar la lista de partes de 3DCityDB");
  }

  const payload = await response.json();
  partsById = new Map(payload.parts.map((part) => [part.id, part]));
  populateParts(payload.parts);
  updateTilesetUrl();
}

partsList.addEventListener("pointerdown", handlePartPointerDown);
partsList.addEventListener("change", handlePartSelectionChange);
selectAllButton.addEventListener("click", () => setAllPartsChecked(true));
clearButton.addEventListener("click", () => setAllPartsChecked(false));
sqlWhere.addEventListener("input", updateTilesetUrl);

applySqlFilterButton.addEventListener("click", loadSelectedLayerInWebMap);
clearSqlFilterButton.addEventListener("click", () => {
  sqlWhere.value = "";
  updateTilesetUrl();
  if (selectedPartIds().length > 0) {
    loadSelectedLayerInWebMap();
  }
});

copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(tilesetUrl.value);
  setStatus("URL de 3D Tiles copiada.");
});
loadLayerButton.addEventListener("click", loadSelectedLayerInWebMap);
flyToButton.addEventListener("click", flyToSelectedParts);
webmapFrame.addEventListener("load", () => {
  window.setTimeout(() => {
    closeSplashWindow(webmapFrame.contentWindow);
    applySatelliteMode(webmapFrame.contentWindow);
  }, 1200);
});

openButton.addEventListener("click", () => {
  window.open(new URL(WEB_MAP_CLIENT_URL, window.location.origin), "_blank");
});

loadParts().catch((error) => {
  console.error(error);
  setStatus(error.message);
});
