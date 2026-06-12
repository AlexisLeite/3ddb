# Architecture diagrams

This document summarizes the most important runtime relationships in the
CityGML LoD viewer. The diagrams are written in Mermaid so they can be rendered
directly by GitHub, VS Code extensions, or Mermaid CLI.

## System communication

```mermaid
flowchart LR
  user[User] --> browser[Browser]
  browser --> react[React gallery app]
  react --> galleryJson[/data/gallery/edificios.json/]
  react --> iframe[3DCityDB Web Map iframe]
  iframe --> webMapClient[/3dcitydb-client proxy/]
  webMapClient --> remoteClient[3DCityDB Web Map CDN]
  iframe --> tileset[/api/citydb/3dtiles/tileset.json/]
  iframe --> tile[/api/citydb/3dtiles/tile.b3dm/]

  subgraph vite[Vite dev server]
    plugin[Server vitePlugin middleware]
    cache[ResponseCache for b3dm payloads]
    loader[DataLoader]
    tiler[DataTiler]
  end

  tileset --> plugin
  tile --> plugin
  plugin --> cache
  plugin --> loader
  plugin --> tiler
  loader --> diskCache[(data/nycity-parts-cache.json)]
  loader --> db[(PostgreSQL 3DCityDB)]
  tiler --> b3dm[b3dm and glTF buffers]
  b3dm --> tile
```

The browser hosts two UI layers: the local React/MobX gallery and the proxied
3DCityDB Web Map client inside an iframe. The iframe loads Cesium 3D Tiles from
the local Vite middleware, while gallery points are loaded from static JSON and
rendered into the embedded Cesium viewer by `GalleryMapStore`.

## Client classes

```mermaid
classDiagram
  class GalleryApp {
    <<component>>
    +GalleryMap
    +GalleryPanel
  }

  class GalleryMap {
    <<component>>
    +iframe
    +map badge
  }

  class GalleryPanel {
    <<component>>
    +tour controls
    +POI list
    +tour stop detail
  }

  class GalleryStore {
    +points PointOfInterest[]
    +selectedPointId string
    +isTourStarted boolean
    +isTourFinished boolean
    +bootstrap() Promise
    +selectPoint(pointId) void
    +startTour() void
    +nextTourPoint() void
  }

  class GalleryMapStore {
    +iframeUrl string
    +isReady boolean
    +isDatasetLoaded boolean
    +isPanoramaActive boolean
    +setFrameElement(element) void
    +initialize() Promise
    +showGallery(points) Promise
    +focusPoint(point) Promise
    +focusTourPoint(point) Promise
    +finishTour(points) Promise
  }

  class GalleryCameraController {
    +bindInteractionHandlers(frameWindow) void
    +showGallery(points) Promise
    +focusPoint(point) Promise
    +focusTourPoint(point) Promise
    +finishTour(points) Promise
    +stopPanorama() void
  }

  class CameraInteractionController {
    +bind(frameWindow) void
  }

  class TourTransitionAnimator {
    +animate(...) Promise
    +cancel() void
  }

  class FocusController {
    +boundsForPoints(points) Bounds
    +paddedBounds(bounds, factor) Bounds
    +flyToBounds(frameWindow, bounds) Promise
    +flyToPoint(frameWindow, point) Promise
    +lookAtPoint(frameWindow, point, heading, pitch, range) boolean
    +captureCameraView(frameWindow) CameraView
    +setBlendedPointView(...) boolean
  }

  class CameraViewController {
    +captureCameraView(Cesium, viewer) CameraView
    +lookAtPoint(Cesium, viewer, point, heading, pitch, range) boolean
    +offsetCameraView(Cesium, viewer, point, heading, pitch, range) CameraView
    +setBlendedPointView(Cesium, viewer, start, target, progress) boolean
    +preserveWorldCameraTransform(Cesium, viewer) void
  }

  class RoutePlanner {
    +plan(points) PointOfInterest[]
  }

  class PointOfInterest {
    <<interface>>
    +id string
    +name string
    +imageUrls string[]
    +latitude number
    +longitude number
    +address string
    +summary string
  }

  GalleryApp --> GalleryMap
  GalleryApp --> GalleryPanel
  GalleryApp --> GalleryStore
  GalleryApp --> GalleryMapStore
  GalleryPanel --> GalleryStore
  GalleryPanel --> GalleryMapStore
  GalleryMap --> GalleryMapStore
  GalleryStore --> RoutePlanner
  GalleryStore --> GalleryMapStore
  GalleryStore --> PointOfInterest
  GalleryMapStore --> GalleryCameraController
  GalleryCameraController --> CameraInteractionController
  GalleryCameraController --> TourTransitionAnimator
  GalleryCameraController --> FocusController
  TourTransitionAnimator --> FocusController
  FocusController --> CameraViewController
```

Relevant source files:

- `src/client/main.tsx`
- `src/client/app/GalleryApp.tsx`
- `src/client/app/GalleryMap.tsx`
- `src/client/app/GalleryPanel.tsx`
- `src/client/stores/GalleryStore.ts`
- `src/client/stores/GalleryMapStore.ts`
- `src/client/stores/GalleryCameraController.ts`
- `src/client/stores/CameraInteractionController.ts`
- `src/client/stores/TourTransitionAnimator.ts`
- `src/client/focus/FocusController.ts`
- `src/client/focus/CameraViewController.ts`
- `src/client/routing/RoutePlanner.ts`

## Server classes

```mermaid
classDiagram
  class ViteConfig {
    +loadEnv()
    +loadServerConfig(rootDir)
    +defineConfig()
  }

  class Server {
    -tileCache ResponseCache
    +vitePlugin() Plugin
    -handleCities(req, res) Promise
    -handleTileset(req, res) Promise
    -handleTile(req, res) Promise
    -requireGet(req, res) boolean
  }

  class DataLoader {
    -partConfigs CityPart[]
    -validPartIds Set
    -partsCache CityPart[]
    +normalizePartIds(partsParam) string[]
    +getParts() Promise
    +refreshParts() Promise
    +partsPayload(parts) object
    +getImportedParts(partIds) Promise
    +loadSurfaces(partIds, view) Promise
  }

  class spatialWindowFromParts {
    <<function>>
    +spatialWindowFromParts(parts) SpatialWindow
  }

  class DBManager {
    -pool pg.Pool
    +query(text, values) Promise
    +close() Promise
  }

  class DataTiler {
    +buildTileset(parts) object
    +buildTile(surfaceData) Buffer
    +emptyTile() Buffer
  }

  class ResponseCache {
    -entries Map
    +get(key) T
    +set(key, body) void
  }

  class CityPart {
    <<interface>>
    +id string
    +label string
    +lod string
    +imported boolean
    +bounds Bounds
    +stats object
  }

  class SurfaceData {
    <<interface>>
    +partIds string[]
    +parts CityPart[]
    +view SpatialWindow
    +surfaces Surface[]
  }

  class Surface {
    <<interface>>
    +partId string
    +geometryId number
    +featureId number
    +objectId string
    +className string
    +rings number[][][]
  }

  ViteConfig --> Server
  ViteConfig --> DBManager
  ViteConfig --> DataLoader
  ViteConfig --> DataTiler
  Server --> ResponseCache
  Server --> DataLoader
  Server --> DataTiler
  DataLoader --> DBManager
  DataLoader --> CityPart
  DataLoader --> SurfaceData
  DataLoader --> spatialWindowFromParts
  SurfaceData --> Surface
  SurfaceData --> CityPart
  DataTiler --> SurfaceData
```

The server is a Vite plugin, not a separate process. It registers middleware for
`/api/citydb/*` and `/3dcitydb-client/*`, then delegates database access to
`DataLoader` and binary tile creation to `DataTiler`.

## Database model used by the app

```mermaid
erDiagram
  citydb_feature {
    bigint id PK
    bigint objectclass_id FK
    text objectid
    text lineage
    geometry envelope
  }

  citydb_property {
    bigint id PK
    bigint feature_id FK
    bigint val_geometry_id FK
    text name
    text val_lod
  }

  citydb_geometry_data {
    bigint id PK
    geometry geometry
  }

  citydb_objectclass {
    bigint id PK
    text classname
  }

  city_layers_nyc_streets {
    bigint id PK
    text name
    geometry geom
  }

  citydb_objectclass ||--o{ citydb_feature : classifies
  citydb_feature ||--o{ citydb_property : owns
  citydb_geometry_data ||--o{ citydb_property : referenced_by
```

The current dynamic 3D Tiles path queries `citydb.feature`,
`citydb.property`, `citydb.geometry_data`, and `citydb.objectclass`.
`feature.lineage` partitions imported delivery areas such as `NYC_DA10`.
`feature.envelope` provides part bounds and `geometry_data.geometry` provides
renderable polygons filtered by the requested tile window. The README also
documents `city_layers.nyc_streets`, but the current `Server.ts` routes do not
register the streets endpoint.

## Tileset and tile request sequence

```mermaid
sequenceDiagram
  autonumber
  participant Cesium as Cesium iframe
  participant Server as Server middleware
  participant Loader as DataLoader
  participant DB as 3DCityDB PostGIS
  participant Tiler as DataTiler
  participant Cache as ResponseCache

  Cesium->>Server: GET /api/citydb/3dtiles/tileset.json?parts=NYC_DA10
  Server->>Loader: normalizePartIds(parts)
  Server->>Loader: getImportedParts(partIds)
  Loader->>DB: cityStatsQuery and partBoundsQuery
  DB-->>Loader: imported parts with bounds
  Loader-->>Server: CityPart[]
  Server->>Tiler: buildTileset(parts)
  Tiler-->>Server: tileset.json with child tile URIs
  Server-->>Cesium: JSON tileset

  Cesium->>Server: GET /api/citydb/3dtiles/tile.b3dm?parts=...&minLon=...
  Server->>Cache: get(searchParams)
  alt cache hit
    Cache-->>Server: Buffer
    Server-->>Cesium: cached b3dm
  else cache miss
    Server->>Loader: loadSurfaces(partIds, spatialWindow)
    Loader->>DB: surfaceQuery with lineage, LoD, limits, envelope
    DB-->>Loader: polygon GeoJSON rows
    Loader-->>Server: SurfaceData
    Server->>Tiler: buildTile(surfaceData)
    Tiler-->>Server: b3dm Buffer
    Server->>Cache: set(searchParams, Buffer)
    Server-->>Cesium: b3dm
  end
```

## App bootstrap sequence

```mermaid
sequenceDiagram
  autonumber
  participant Main as main.tsx
  participant GalleryStore
  participant MapStore as GalleryMapStore
  participant Iframe as 3DCityDB iframe
  participant Cesium as Cesium viewer

  Main->>MapStore: new GalleryMapStore()
  Main->>GalleryStore: new GalleryStore(mapStore)
  Main->>Main: render GalleryApp
  Main->>GalleryStore: bootstrap()
  GalleryStore->>GalleryStore: fetch /data/gallery/edificios.json
  GalleryStore->>GalleryStore: normalize points
  GalleryStore->>GalleryStore: RoutePlanner.plan(points)
  GalleryStore->>MapStore: showGallery(points)

  GalleryMap->>MapStore: setFrameElement(iframe)
  Iframe-->>MapStore: load event
  MapStore->>Iframe: waitForClient()
  MapStore->>Cesium: applySatelliteMode()
  MapStore->>Cesium: loadDataset(tileset URL)
  MapStore->>Cesium: bindInteractionHandlers()
  MapStore->>Cesium: render POIs and route
  MapStore->>Cesium: camera.showGallery(points)
```

`GalleryStore.bootstrap()` and `GalleryMapStore.initialize()` can overlap. Both
paths call `waitForClient()`, so rendering gallery entities is delayed until the
iframe exposes `Cesium.Cesium3DTileset` and `cesiumViewer`.

## Guided tour sequence

```mermaid
sequenceDiagram
  autonumber
  participant User
  participant Panel as GalleryPanel
  participant Store as GalleryStore
  participant MapStore as GalleryMapStore
  participant Camera as GalleryCameraController
  participant Focus as FocusController
  participant Cesium

  User->>Panel: click Iniciar recorrido
  Panel->>Store: startTour()
  Store->>Store: select first/current point
  Store->>Store: start carousel timer
  Store->>MapStore: focusTourPoint(point)
  MapStore->>Camera: focusTourPoint(point)
  Camera->>Focus: captureCameraView()
  Camera->>Focus: flyToPoint() or animated blend
  Focus->>Cesium: camera flyTo / setView
  Camera->>Cesium: start point orbit interval

  User->>Panel: click Siguiente
  Panel->>Store: nextTourPoint()
  Store->>Store: advance point or finish
  Store->>MapStore: focusTourPoint(nextPoint)
  MapStore->>Camera: focusTourPoint(nextPoint)
  Camera->>Focus: setBlendedPointView()
  Focus->>Cesium: update world camera pose
  Camera->>Cesium: resume point orbit

  User->>Cesium: wheel/pan/touch
  Cesium-->>Camera: interaction listener
  Camera->>Camera: pause orbit and schedule resume
  Camera->>Focus: refocus after delay
  Focus->>Cesium: restore presentation or point orbit
```

<!-- ## Tile generation pipeline -->

```mermaid
flowchart TD
  surfaces[Surface rows from DataLoader] --> frame[localFrameForParts]
  frame --> mesh[meshFromSurfaces]
  surfaces --> mesh
  mesh --> validate[normalize rings and classify surface]
  validate --> enu[convert lon/lat/z to local ENU]
  enu --> project[project polygons to 2D]
  project --> triangulate[Three.ShapeUtils.triangulateShape]
  triangulate --> buffers[vertex, normal, color, batch and outline buffers]
  buffers --> glb[glbFromMesh]
  glb --> batch[batch table from mesh batches]
  batch --> b3dm[b3dmFromMesh]
```

The generated `b3dm` contains a glTF mesh with triangle and line primitives.
Batch table metadata preserves `partId`, `geometryId`, `featureId`, `objectId`,
`className`, `lod`, `property`, and derived `surfaceType` for Cesium styling or
inspection.
