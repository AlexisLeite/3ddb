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
const AUTO_LOAD_ALL_PARTS = envBoolean("VITE_AUTO_LOAD_ALL_PARTS", true);
const TILESET_MAX_SCREEN_SPACE_ERROR = envNumber(
  "VITE_TILESET_MAX_SCREEN_SPACE_ERROR",
  2,
);
const TILESET_RENDER_WAIT_MS = envNumber("VITE_TILESET_RENDER_WAIT_MS", 60000);
const APPLY_TILE_STYLE = envBoolean("VITE_APPLY_TILE_STYLE", false);
const STREETS_ENABLED = envBoolean("VITE_STREETS_ENABLED", true);
const STREETS_COLOR = envString("VITE_STREETS_COLOR", "#f4f0cf");
const STREETS_ALPHA = envNumber("VITE_STREETS_ALPHA", 0.88);
const STREETS_WIDTH = envNumber("VITE_STREETS_WIDTH", 2);
const STREETS_FETCH_PADDING = envNumber("VITE_STREETS_FETCH_PADDING", 1.15);
const STREETS_RELOAD_DEBOUNCE_MS = envNumber("VITE_STREETS_RELOAD_DEBOUNCE_MS", 450);
const STREETS_LABELS_ENABLED = envBoolean("VITE_STREETS_LABELS_ENABLED", true);
const STREETS_LABEL_LIMIT = envNumber("VITE_STREETS_LABEL_LIMIT", 220);
const STREETS_LABEL_MAX_CAMERA_HEIGHT = envNumber(
  "VITE_STREETS_LABEL_MAX_CAMERA_HEIGHT",
  6000,
);
const STREETS_LABEL_MIN_SPACING_METERS = envNumber(
  "VITE_STREETS_LABEL_MIN_SPACING_METERS",
  90,
);
const STREETS_LABEL_SCALE = envNumber("VITE_STREETS_LABEL_SCALE", 0.55);
const STREETS_LABEL_COLOR = envString("VITE_STREETS_LABEL_COLOR", "#fff8d8");
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
const streetsToggle = requiredElement("#streetsToggle");
const copyButton = requiredElement("#copyTilesetUrl");
const loadLayerButton = requiredElement("#loadWebmapLayer");
const flyToButton = requiredElement("#flyToWebmapLayer");
const openButton = requiredElement("#openWebMapClient");
const statusEl = requiredElement("#webmapStatus");
const webmapFrame = requiredElement("#webmapFrame");
const loadLayerButtonText = loadLayerButton.textContent;
const applySqlFilterButtonText = applySqlFilterButton.textContent;

streetsToggle.checked = STREETS_ENABLED;

let partsById = new Map();
let loadedTileset = null;
let loadedStreetsDataSource = null;
let loadedStreetLabelsDataSource = null;
let loadedPartKey = "";
let renderRecoveryScene = null;
let activeLoadController = null;
let activeStreetsController = null;
let activeLoadId = 0;
let activeStreetsLoadId = 0;
let isLayerLoading = false;
let initialCameraApplied = false;
let streetsCameraMoveCleanup = null;
let streetClickHandler = null;
let streetClickHandlerCanvas = null;
let streetsReloadTimer = 0;
let lastStreetsRequestKey = "";

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
  streetsToggle.disabled = isLayerLoading;

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

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function paddedBounds(bounds, factor) {
  const lonCenter = (bounds.minLon + bounds.maxLon) / 2;
  const latCenter = (bounds.minLat + bounds.maxLat) / 2;
  const lonHalfSpan = Math.max((bounds.maxLon - bounds.minLon) * factor * 0.5, 0.001);
  const latHalfSpan = Math.max((bounds.maxLat - bounds.minLat) * factor * 0.5, 0.001);

  return {
    minLon: clampNumber(lonCenter - lonHalfSpan, -180, 180),
    minLat: clampNumber(latCenter - latHalfSpan, -90, 90),
    maxLon: clampNumber(lonCenter + lonHalfSpan, -180, 180),
    maxLat: clampNumber(latCenter + latHalfSpan, -90, 90),
  };
}

function intersectBounds(left, right) {
  const bounds = {
    minLon: Math.max(left.minLon, right.minLon),
    minLat: Math.max(left.minLat, right.minLat),
    maxLon: Math.min(left.maxLon, right.maxLon),
    maxLat: Math.min(left.maxLat, right.maxLat),
  };

  return bounds.minLon < bounds.maxLon && bounds.minLat < bounds.maxLat
    ? bounds
    : null;
}

function roundedBounds(bounds, digits = 5) {
  const round = (value) => Number(value.toFixed(digits));
  return {
    minLon: round(bounds.minLon),
    minLat: round(bounds.minLat),
    maxLon: round(bounds.maxLon),
    maxLat: round(bounds.maxLat),
  };
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

function streetsUrlForBounds(bounds) {
  const url = new URL("/api/citydb/streets", window.location.origin);
  url.searchParams.set("minLon", bounds.minLon.toString());
  url.searchParams.set("minLat", bounds.minLat.toString());
  url.searchParams.set("maxLon", bounds.maxLon.toString());
  url.searchParams.set("maxLat", bounds.maxLat.toString());
  return url.toString();
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
    removeLoadedStreets(frameWindow);

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

function detachLoadedStreets(frameWindow) {
  const dataSources = frameWindow?.cesiumViewer?.dataSources;
  if (loadedStreetLabelsDataSource && dataSources) {
    dataSources.remove(loadedStreetLabelsDataSource, true);
  }
  if (loadedStreetsDataSource && dataSources) {
    dataSources.remove(loadedStreetsDataSource, true);
  }
  loadedStreetLabelsDataSource = null;
  loadedStreetsDataSource = null;
  lastStreetsRequestKey = "";
  frameWindow?.cesiumViewer?.scene?.requestRender?.();
}

function removeLoadedStreets(frameWindow) {
  activeStreetsController?.abort();
  activeStreetsController = null;
  activeStreetsLoadId += 1;
  window.clearTimeout(streetsReloadTimer);
  streetsReloadTimer = 0;
  detachLoadedStreets(frameWindow);
}

function currentCesiumViewBounds(frameWindow) {
  const Cesium = frameWindow?.Cesium;
  const viewer = frameWindow?.cesiumViewer;
  const rectangle = viewer?.camera?.computeViewRectangle?.(
    viewer.scene?.globe?.ellipsoid,
  );
  if (!Cesium || !rectangle) return null;

  return {
    minLon: Cesium.Math.toDegrees(rectangle.west),
    minLat: Cesium.Math.toDegrees(rectangle.south),
    maxLon: Cesium.Math.toDegrees(rectangle.east),
    maxLat: Cesium.Math.toDegrees(rectangle.north),
  };
}

function streetRequestBounds(frameWindow) {
  const selected = selectedBounds();
  const visible = currentCesiumViewBounds(frameWindow);
  const bounds = visible && selected ? intersectBounds(visible, selected) || selected : visible || selected;

  return bounds ? roundedBounds(paddedBounds(bounds, STREETS_FETCH_PADDING)) : null;
}

function streetColor(Cesium) {
  const baseColor =
    Cesium.Color.fromCssColorString(STREETS_COLOR) || Cesium.Color.WHITE.clone();
  return baseColor.withAlpha(clampNumber(STREETS_ALPHA, 0, 1));
}

function propertyValue(properties, name, Cesium) {
  const value = properties?.[name];
  if (value?.getValue) {
    return value.getValue(Cesium?.JulianDate?.now?.());
  }
  return value;
}

function streetRecordFromProperties(properties, Cesium) {
  return {
    gid: propertyValue(properties, "gid", Cesium),
    label: propertyValue(properties, "label", Cesium),
    completeStreet: propertyValue(properties, "completeStreet", Cesium),
    streetName: propertyValue(properties, "streetName", Cesium),
    postType: propertyValue(properties, "postType", Cesium),
    highwayNumber: propertyValue(properties, "highwayNumber", Cesium),
    nysStreetId: propertyValue(properties, "nysStreetId", Cesium),
    fcc: propertyValue(properties, "fcc", Cesium),
    speed: propertyValue(properties, "speed", Cesium),
    oneWay: propertyValue(properties, "oneWay", Cesium),
    leftCounty: propertyValue(properties, "leftCounty", Cesium),
    rightCounty: propertyValue(properties, "rightCounty", Cesium),
    status: propertyValue(properties, "status", Cesium),
  };
}

function streetDisplayNameFromRecord(street) {
  const label = street?.label || street?.completeStreet;
  if (label) return String(label);

  const name = [street?.streetName, street?.postType].filter(Boolean).join(" ");
  if (name) return name;

  return street?.highwayNumber ? `Route ${street.highwayNumber}` : "";
}

function streetDisplayName(properties, Cesium) {
  return streetDisplayNameFromRecord(streetRecordFromProperties(properties, Cesium));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function streetDescriptionHtml(street) {
  const rows = [
    ["Nombre", streetDisplayNameFromRecord(street)],
    ["ID NYS", street.nysStreetId],
    ["Tipo", street.fcc],
    ["Velocidad", street.speed ? `${street.speed} mph` : ""],
    ["Sentido", street.oneWay],
    ["Condado", street.leftCounty === street.rightCounty
      ? street.leftCounty
      : [street.leftCounty, street.rightCounty].filter(Boolean).join(" / ")],
    ["Estado", street.status],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");

  return `
    <table class="cesium-infoBox-defaultTable">
      <tbody>
        ${rows
          .map(
            ([key, value]) =>
              `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function styleStreetsDataSource(frameWindow, dataSource) {
  const Cesium = frameWindow.Cesium;
  const color = streetColor(Cesium);
  for (const entity of dataSource.entities.values) {
    if (!entity.polyline) continue;
    const street = streetRecordFromProperties(entity.properties, Cesium);
    const name = streetDisplayNameFromRecord(street);
    if (name) {
      entity.name = name;
      entity.description = new Cesium.ConstantProperty(streetDescriptionHtml(street));
    }
    entity.polyline.material = color;
    entity.polyline.depthFailMaterial = color.withAlpha(Math.min(STREETS_ALPHA + 0.1, 1));
    entity.polyline.width = STREETS_WIDTH;
    entity.polyline.clampToGround = true;
  }
}

function lineStringsFromGeometry(geometry) {
  if (geometry?.type === "LineString") {
    return [geometry.coordinates];
  }
  if (geometry?.type === "MultiLineString") {
    return geometry.coordinates;
  }
  return [];
}

function lonLatDistanceMeters(left, right) {
  const midLat = ((left[1] + right[1]) / 2) * (Math.PI / 180);
  const lonMeters = (right[0] - left[0]) * 111320 * Math.cos(midLat);
  const latMeters = (right[1] - left[1]) * 111320;
  return Math.hypot(lonMeters, latMeters);
}

function lineStringLengthMeters(coordinates) {
  let length = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    length += lonLatDistanceMeters(coordinates[index - 1], coordinates[index]);
  }
  return length;
}

function midpointOnLineString(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return null;
  if (coordinates.length === 1) return coordinates[0];

  const totalLength = lineStringLengthMeters(coordinates);
  if (totalLength <= 0) return coordinates[Math.floor(coordinates.length / 2)];

  let walked = 0;
  const target = totalLength / 2;
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const segmentLength = lonLatDistanceMeters(start, end);
    if (walked + segmentLength >= target && segmentLength > 0) {
      const ratio = (target - walked) / segmentLength;
      return [
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio,
      ];
    }
    walked += segmentLength;
  }

  return coordinates.at(-1);
}

function labelPositionForGeometry(geometry) {
  const lineStrings = lineStringsFromGeometry(geometry)
    .filter((coordinates) => Array.isArray(coordinates) && coordinates.length > 0)
    .sort((left, right) => lineStringLengthMeters(right) - lineStringLengthMeters(left));

  return lineStrings.length > 0 ? midpointOnLineString(lineStrings[0]) : null;
}

function shouldShowStreetLabels(frameWindow) {
  if (!STREETS_LABELS_ENABLED) return false;
  const cameraHeight =
    frameWindow?.cesiumViewer?.camera?.positionCartographic?.height ?? Infinity;
  return cameraHeight <= STREETS_LABEL_MAX_CAMERA_HEIGHT;
}

async function addStreetLabels(frameWindow, payload) {
  const Cesium = frameWindow?.Cesium;
  const viewer = frameWindow?.cesiumViewer;
  if (!Cesium?.CustomDataSource || !viewer?.dataSources) return 0;

  if (loadedStreetLabelsDataSource) {
    viewer.dataSources.remove(loadedStreetLabelsDataSource, true);
    loadedStreetLabelsDataSource = null;
  }

  if (!shouldShowStreetLabels(frameWindow)) return 0;

  const labelDataSource = new Cesium.CustomDataSource("NYC Street Labels");
  const labelColor =
    Cesium.Color.fromCssColorString(STREETS_LABEL_COLOR) || Cesium.Color.WHITE.clone();
  const cellSize = STREETS_LABEL_MIN_SPACING_METERS / 111320;
  const usedCells = new Set();
  const usedNameCells = new Set();
  let labelCount = 0;

  for (const feature of payload.features || []) {
    if (labelCount >= STREETS_LABEL_LIMIT) break;

    const name = streetDisplayNameFromRecord(feature.properties);
    const position = labelPositionForGeometry(feature.geometry);
    if (!name || !position) continue;

    const cell = `${Math.round(position[0] / cellSize)},${Math.round(position[1] / cellSize)}`;
    const nameCell = `${name.toLowerCase()}|${cell}`;
    if (usedCells.has(cell) || usedNameCells.has(nameCell)) continue;

    usedCells.add(cell);
    usedNameCells.add(nameCell);
    labelCount += 1;

    labelDataSource.entities.add({
      id: `street-label-${feature.id}`,
      name,
      position: Cesium.Cartesian3.fromDegrees(position[0], position[1], 4),
      description: new Cesium.ConstantProperty(streetDescriptionHtml(feature.properties)),
      properties: feature.properties,
      label: {
        text: name,
        font: "600 13px Inter, Segoe UI, sans-serif",
        fillColor: labelColor,
        outlineColor: Cesium.Color.BLACK.withAlpha(0.75),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        scale: STREETS_LABEL_SCALE,
        showBackground: true,
        backgroundColor: Cesium.Color.BLACK.withAlpha(0.42),
        backgroundPadding: new Cesium.Cartesian2(5, 3),
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -4),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        heightReference: Cesium.HeightReference?.CLAMP_TO_GROUND,
      },
    });
  }

  if (labelCount > 0) {
    loadedStreetLabelsDataSource = await viewer.dataSources.add(labelDataSource);
  }
  return labelCount;
}

function pickedStreetEntity(picked) {
  const entity = picked?.id;
  if (!entity?.properties) return null;
  if (entity.polyline || entity.label) return entity;
  return null;
}

function installStreetClickHandler(frameWindow) {
  const Cesium = frameWindow?.Cesium;
  const viewer = frameWindow?.cesiumViewer;
  const canvas = viewer?.scene?.canvas;
  if (!Cesium?.ScreenSpaceEventHandler || !canvas) return;
  if (streetClickHandlerCanvas === canvas) return;

  streetClickHandler?.destroy?.();
  streetClickHandler = new Cesium.ScreenSpaceEventHandler(canvas);
  streetClickHandlerCanvas = canvas;
  streetClickHandler.setInputAction((movement) => {
    const entity = pickedStreetEntity(viewer.scene.pick(movement.position));
    if (!entity) return;

    const street = streetRecordFromProperties(entity.properties, Cesium);
    const name = streetDisplayNameFromRecord(street);
    if (!name) return;

    entity.name = name;
    entity.description = new Cesium.ConstantProperty(streetDescriptionHtml(street));
    viewer.selectedEntity = entity;
    setStatus(
      `Calle: ${name}${street.speed ? ` · ${street.speed} mph` : ""}${street.oneWay ? ` · sentido ${street.oneWay}` : ""}.`,
    );
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

function activeLayerStatus(streetCount = null, capped = false, labelCount = null) {
  const partIds = selectedPartIds();
  const partText = `${partIds.length} parte${partIds.length === 1 ? "" : "s"}`;
  const streetText =
    streetCount === null
      ? ""
      : ` Calles visibles: ${streetCount.toLocaleString("es-UY")}${capped ? "+" : ""}.`;
  const labelText =
    labelCount === null
      ? ""
      : labelCount > 0
        ? ` Nombres visibles: ${labelCount.toLocaleString("es-UY")}.`
        : " Acercate para ver nombres de calles.";
  return `Capa 3D Tiles activa para ${partText}; Cesium cargara las celdas visibles segun la camara.${streetText}${labelText}`;
}

async function loadVisibleStreets(frameWindow = webmapFrame.contentWindow) {
  if (!streetsToggle.checked) {
    removeLoadedStreets(frameWindow);
    return;
  }
  if (selectedPartIds().length === 0) return;

  const Cesium = frameWindow?.Cesium;
  const viewer = frameWindow?.cesiumViewer;
  if (!Cesium?.GeoJsonDataSource || !viewer?.dataSources) return;
  installStreetClickHandler(frameWindow);

  const bounds = streetRequestBounds(frameWindow);
  if (!bounds) return;

  const url = streetsUrlForBounds(bounds);
  if (url === lastStreetsRequestKey && loadedStreetsDataSource) return;

  activeStreetsController?.abort();
  const loadController = new AbortController();
  const loadId = activeStreetsLoadId + 1;
  activeStreetsController = loadController;
  activeStreetsLoadId = loadId;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: loadController.signal,
    });

    if (!response.ok) {
      let message = `No se pudo cargar la capa de calles (${response.status}).`;
      try {
        const body = await response.json();
        if (body?.error) message = body.error;
      } catch {
        // Keep the status-based message if the server did not send JSON.
      }
      throw new Error(message);
    }

    const payload = await response.json();
    if (loadController.signal.aborted || loadId !== activeStreetsLoadId) return;

    const color = streetColor(Cesium);
    const dataSource = await Cesium.GeoJsonDataSource.load(payload, {
      clampToGround: true,
      stroke: color,
      strokeWidth: STREETS_WIDTH,
    });
    if (loadController.signal.aborted || loadId !== activeStreetsLoadId) return;

    dataSource.name = "NYC Streets";
    styleStreetsDataSource(frameWindow, dataSource);
    detachLoadedStreets(frameWindow);
    loadedStreetsDataSource = await viewer.dataSources.add(dataSource);
    if (loadController.signal.aborted || loadId !== activeStreetsLoadId) {
      detachLoadedStreets(frameWindow);
      return;
    }
    const labelCount = await addStreetLabels(frameWindow, payload);
    if (loadController.signal.aborted || loadId !== activeStreetsLoadId) {
      detachLoadedStreets(frameWindow);
      return;
    }
    lastStreetsRequestKey = url;
    viewer.scene.requestRender?.();

    if (!isLayerLoading) {
      const stats = payload.metadata?.stats;
      setStatus(
        activeLayerStatus(
          payload.features?.length || 0,
          Boolean(stats?.capped),
          labelCount,
        ),
      );
    }
  } catch (error) {
    if (error.name === "AbortError") return;
    console.error(error);
    if (!isLayerLoading) {
      setStatus(error.message);
    }
  } finally {
    if (activeStreetsController === loadController) {
      activeStreetsController = null;
    }
  }
}

function scheduleStreetReload(frameWindow, { immediate = false } = {}) {
  if (!streetsToggle.checked || selectedPartIds().length === 0) return;

  window.clearTimeout(streetsReloadTimer);
  const run = () => loadVisibleStreets(frameWindow);
  if (immediate) {
    run();
    return;
  }
  streetsReloadTimer = window.setTimeout(run, STREETS_RELOAD_DEBOUNCE_MS);
}

function installStreetCameraReload(frameWindow) {
  const moveEnd = frameWindow?.cesiumViewer?.camera?.moveEnd;
  if (!moveEnd?.addEventListener) return;
  streetsCameraMoveCleanup?.();
  streetsCameraMoveCleanup = addCesiumEventListener(moveEnd, () => {
    scheduleStreetReload(frameWindow);
  });
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
    installStreetCameraReload(frameWindow);

    removeLoadedTileset(frameWindow);
    removeLoadedStreets(frameWindow);
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
    setStatus("Descargando y renderizando tiles visibles...", true);
    frameWindow.cesiumViewer.scene.requestRender?.();
    await initialRenderPromise;
    if (loadController.signal.aborted || loadId !== activeLoadId) return;

    applySatelliteMode(frameWindow);
    await loadVisibleStreets(frameWindow);

    if (!streetsToggle.checked) {
      setStatus(activeLayerStatus());
    }
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
  scheduleStreetReload(frameWindow);
}

function clearLoadedLayer() {
  activeLoadController?.abort();
  activeLoadController = null;
  activeLoadId += 1;
  setLayerLoading(false);

  removeLoadedTileset(webmapFrame.contentWindow);
  removeLoadedStreets(webmapFrame.contentWindow);
}

function setAllPartsChecked(checked) {
  const inputs = partCheckboxes();
  for (const input of inputs) {
    input.checked = checked && input.dataset.imported === "true";
  }

  if (!checked) {
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
      input.checked = Boolean(part.imported);
      input.disabled = !part.imported;

      const name = document.createElement("span");
      name.className = "part-name";
      name.textContent = part.label;

      label.append(input, name);
      return label;
    }),
  );
}

function defaultCameraBounds() {
  return (
    partsById.get(DEFAULT_SELECTED_PART_ID)?.bounds ||
    [...partsById.values()].find((part) => part.imported && part.bounds)?.bounds ||
    selectedBounds()
  );
}

function applyInitialCamera() {
  if (initialCameraApplied) return;
  const bounds = defaultCameraBounds();
  if (!bounds) return;

  initialCameraApplied = true;
  webmapFrame.src = clientUrlWithCamera(cameraForBounds(bounds)).toString();
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
  applyInitialCamera();
  if (AUTO_LOAD_ALL_PARTS && selectedPartIds().length > 0) {
    loadSelectedLayerInWebMap();
  }
}

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

streetsToggle.addEventListener("change", async () => {
  if (!streetsToggle.checked) {
    removeLoadedStreets(webmapFrame.contentWindow);
    setStatus("Calles NYC ocultas.");
    return;
  }

  try {
    const frameWindow = await waitForWebMapClient();
    installStreetCameraReload(frameWindow);
    await loadVisibleStreets(frameWindow);
  } catch (error) {
    console.error(error);
    setStatus(error.message);
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
    installStreetCameraReload(webmapFrame.contentWindow);
    scheduleStreetReload(webmapFrame.contentWindow, { immediate: true });
  }, 1200);
});

openButton.addEventListener("click", () => {
  window.open(new URL(WEB_MAP_CLIENT_URL, window.location.origin), "_blank");
});

loadParts().catch((error) => {
  console.error(error);
  setStatus(error.message);
});
