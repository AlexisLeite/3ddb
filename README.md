# 3DCityDB NYC Virtual Gallery

This app is a Vite development workspace for exploring an imported New York
City 3DCityDB dataset through a guided virtual gallery. The browser UI is a
React/MobX app that embeds the official 3DCityDB Web Map Client in an iframe,
loads Central Park area points of interest from local JSON, and streams dynamic
3D Tiles generated from PostgreSQL/PostGIS.

The current experience is not a generic file importer UI. It is a focused NYC
viewer with:

- a guided POI tour loaded from `data/gallery/edificios.json`;
- deterministic route ordering for the tour points;
- an embedded Cesium map from the proxied 3DCityDB Web Map Client;
- on-demand 3D Tiles built from 3DCityDB LoD2 surfaces;
- per-stop bounding-box filtering that registers short-lived SQL render filters;
- a small Vite middleware API for city metadata, query previews, tilesets and
  b3dm tile payloads.

Architecture diagrams live in `docs/architecture-diagrams.md`.

## Tech Stack

- Vite 8 with custom development-server middleware.
- React 19 for the local gallery shell.
- MobX for client state.
- Three.js utilities for triangulating surfaces into b3dm mesh payloads.
- PostgreSQL/PostGIS with 3DCityDB v5 as the source of truth.
- The official hosted 3DCityDB Web Map Client, proxied locally under
  `/3dcitydb-client`.

## Repository Layout

```text
src/client/      React app, MobX stores, Cesium iframe integration and query UI
src/server/      Vite middleware, database access, SQL validation and 3D tiling
data/gallery/    POI source files used by the guided tour
docs/            Architecture diagrams
scripts/         Local repository checks
```

## Prerequisites

- Node.js and npm.
- A reachable PostgreSQL database containing a 3DCityDB v5 schema.
- Imported NYC delivery-area data with lineages such as `NYC_DA1` through
  `NYC_DA20`.

The app assumes the original NYC geometry is in EPSG:2263. Server queries
transform geometry to EPSG:4326 for Cesium/browser output, and generated
bounding-box filters transform lon/lat windows back to EPSG:2263 before
intersecting `citydb.geometry_data.geometry`.

If a new dataset uses a different source CRS, update the hard-coded EPSG:2263
transforms in `src/server/data/queries.ts` and
`src/client/query/bboxWhereSql.ts`.

## Run the App

```bash
npm install
npm run dev
```

Vite serves the app on `http://127.0.0.1:5173` unless that port is already in
use.

Available package scripts:

- `npm run dev`: starts Vite and the local 3DCityDB API middleware.
- `npm run lint-modules`: checks repository module rules, including the
  one-class-or-component-per-code-file rule.

There is currently no production build script in `package.json`.

## Configuration

Configuration is read from `.env` through `vite.config.ts`. All variables have
defaults, so a local `.env` is only needed when the defaults do not match your
database or desired map behavior.

Important server variables:

```env
CITYDB_HOST=127.0.0.1
CITYDB_PORT=5432
CITYDB_NAME=citydb
CITYDB_USER=citydb
CITYDB_PASSWORD=changeMe
CITYDB_OPTIONS=-c max_parallel_workers_per_gather=0 -c jit=off

NYC_PART_COUNT=20
NYC_DEFAULT_PART_ID=NYC_DA10
NYC_LOD=2
NYC_VERTICAL_SCALE=0.3048006096
NYC_PARTS_REFRESH_ON_START=true

WEB_MAP_BASE_URL=https://www.3dcitydb.org/3dcitydb-web-map/2.0.0/
DEV_SERVER_HOST=127.0.0.1
```

Important client and tile variables:

```env
VITE_DEFAULT_SELECTED_PART_ID=NYC_DA10
VITE_CESIUM_RESOLUTION_SCALE=0.78
VITE_TILESET_MAX_SCREEN_SPACE_ERROR=8
VITE_TILESET_DYNAMIC_SCREEN_SPACE_ERROR=true

TILESET_GRID_DIVISIONS=16
TILE_RESPONSE_CACHE_LIMIT=12
TILE_RESPONSE_CACHE_MS=120000
TILE_RENDER_EDGES=false
```

The server-side default is `NYC_DEFAULT_PART_ID`. The client falls back to
`NYC_DA1` if `VITE_DEFAULT_SELECTED_PART_ID` is omitted. Set both variables to
the same part when you want the initial map and SQL query context to target the
same delivery area.

SQL query limits:

```env
SQL_QUERY_MAX_LENGTH=4000
SQL_QUERY_MAX_ROWS=200
SQL_QUERY_MAX_RENDER_IDS=5000
SQL_QUERY_TIMEOUT_MS=3000
SQL_QUERY_REGISTRY_LIMIT=80
SQL_QUERY_REGISTRY_TTL_MS=1800000
```

Color and alpha variables are read from the same tile config path, for example
`VITE_TILE_COLOR_ROOF`, `VITE_TILE_ALPHA_ROOF`, `VITE_TILE_COLOR_WALL` and
`VITE_TILE_ALPHA_WALL`.

## Gallery Data

The React app loads `data/gallery/edificios.json` at startup. The current file
contains 15 points of interest around Central Park and nearby museums.

Each entry uses this shape:

```json
{
  "nombre": "The Metropolitan Museum of Art",
  "imagen": "https://example.com/image.jpg",
  "imagenes": ["https://example.com/optional-extra-image.jpg"],
  "coordenadas_geograficas": {
    "latitud": 40.779434,
    "longitud": -73.963402
  },
  "numero_de_calle": "1000 Fifth Avenue",
  "resumen_del_lugar": "Short description shown in the tour panel."
}
```

`imagenes` is optional. The client normalizes the Spanish field names into
`PointOfInterest`, orders the points with a nearest-neighbor plus 2-opt route
planner, renders point labels and a route polyline in Cesium, and starts a
slow presentation orbit before the tour begins.

`data/gallery/edificios.geojson` is kept as a companion data file, but the
running React app currently reads the JSON file.

## HTTP API

The Vite development server installs all API routes under `/api/citydb`.

### City Metadata

```http
GET /api/citydb/cities
GET /api/citydb/cities?refresh=1
```

Returns database metadata, dataset details and configured delivery areas. The
server caches part metadata in `data/nycity-parts-cache.json` and refreshes it
from `citydb.feature` bounds and lineage statistics when configured or when
`refresh=1` is present.

### 3D Tiles

```http
GET /api/citydb/3dtiles/tileset.json?parts=NYC_DA10
GET /api/citydb/3dtiles/tileset.json?parts=NYC_DA10&queryId=abc123
GET /api/citydb/3dtiles/tile.b3dm?parts=NYC_DA10&minLon=-73.98&minLat=40.76&maxLon=-73.95&maxLat=40.79
```

`tileset.json` returns a dynamic 3D Tiles document. Child tile URLs include the
requested spatial window so Cesium only asks for visible grid cells. `tile.b3dm`
loads LoD surfaces from 3DCityDB, applies an optional registered render filter,
triangulates polygon rings with Three.js, and returns a batched 3D model tile.

The tile pipeline exposes batch metadata for `partId`, `geometryId`,
`featureId`, `objectId`, `className`, `lod`, `property` and `surfaceType`.

### SQL Query Preview and Render Filters

```http
POST /api/citydb/query
Content-Type: application/json
```

Example `where` request:

```json
{
  "mode": "where",
  "sql": "bm.height_m >= 30",
  "tourPointId": "poi-1",
  "limit": 200
}
```

Example `select` request:

```json
{
  "mode": "select",
  "sql": "select gd.id as geometry_id from citydb.geometry_data gd limit 100",
  "tourPointId": "poi-1",
  "limit": 50
}
```

The response includes a preview table and a `queryId`. Passing that `queryId`
to the 3D Tiles endpoints filters the rendered buildings until the registry
entry expires.

`where` mode is evaluated inside the server query that aliases:

- `f`: `citydb.feature`
- `p`: `citydb.property`
- `gd`: `citydb.geometry_data`
- `oc`: `citydb.objectclass`
- `bm`: calculated building metrics with `height_m`, `area_m2`, `height_rank`
  and `area_rank`

`select` mode must begin with `SELECT` or `WITH` and return either
`feature_id` or `geometry_id` so the tile pipeline knows what to render.

The SQL validator rejects semicolons, SQL comments, external `$1` parameters
and mutating/admin keywords. Requests run in a read-only transaction with the
configured timeout.

### Web Map Client Proxy

```http
GET /3dcitydb-client/3dwebclient/index.html
```

Requests under `/3dcitydb-client` are proxied to `WEB_MAP_BASE_URL`. The React
map component embeds this proxied client and then manipulates the Cesium viewer
inside the iframe once the client is ready.

## Current UI Behavior

On startup, the UI:

1. Loads the gallery JSON.
2. Plans the POI route.
3. Waits for the embedded 3DCityDB Web Map Client.
4. Loads the default delivery area as a dynamic 3D Tiles dataset.
5. Draws POI labels and a route line.
6. Starts an overview camera presentation.

The left panel starts the guided route, moves between points, shows each
place's image carousel and text, and exposes a per-stop bounding-box filter.
The visible query UI currently generates `where` SQL for a square box around
the selected POI. Successful results are remembered per stop and restored when
the tour returns to that point.

## Useful Query Conditions

These are `where` conditions for the backend query context. Do not include
`WHERE` or a trailing semicolon.

```sql
bm.height_m < 30
```

```sql
bm.height_m >= 30
```

```sql
bm.area_m2 > 1000
```

```sql
bm.height_rank <= 100
```

```sql
bm.area_rank <= 100
```

Spatial bounding box around a lon/lat window:

```sql
gd.geometry && ST_Transform(ST_MakeEnvelope(-73.9849, 40.7658, -73.9790, 40.7703, 4326), 2263)
```

## Importing More 3DCityDB Data

Use the official 3DCityDB tooling to import data. Do not insert rows manually
into `citydb.feature`, `citydb.property` or `citydb.geometry_data`; the
importer maintains the normalized schema, geometry relations, extents and
indexes.

The app discovers configured NYC delivery areas by lineage. To add another
part without code changes, import it with the next `NYC_DA<N>` lineage and set
`NYC_PART_COUNT` high enough for that id.

Example CityGML import with Docker:

```bash
mkdir -p data/imports

docker run --rm -it \
  --network container:3dcitydb \
  -v "$PWD/data/imports:/data" \
  3dcitydb/citydb-tool:1.3.1 import citygml \
  -H localhost \
  -P 5432 \
  -d citydb \
  -S citydb \
  -u citydb \
  -p changeMe \
  --lineage NYC_DA21 \
  --import-mode skip \
  --compute-extent \
  --index-mode drop_create \
  -- \
  /data/my-layer.gml
```

For CityJSON, use the `import cityjson` subcommand with the same connection and
lineage options.

Verify the import:

```bash
docker exec 3dcitydb psql -U citydb -d citydb -c \
  "select lineage, count(*) from citydb.feature where lineage like 'NYC_DA%' group by lineage order by lineage;"
```

Verify renderable LoD geometry:

```bash
docker exec 3dcitydb psql -U citydb -d citydb -c \
  "select f.lineage, p.val_lod, count(*) from citydb.property p join citydb.feature f on f.id = p.feature_id where f.lineage = 'NYC_DA21' and p.val_geometry_id is not null group by f.lineage, p.val_lod order by f.lineage, p.val_lod;"
```

After changing `.env`, restart `npm run dev` so Vite reloads the environment.

## Notes and Known Boundaries

- The app is currently tuned for NYC LoD2 delivery-area data and `NYC_DA*`
  lineages.
- The default surface query uses `NYC_LOD=2` and converts source heights from
  feet to meters with `NYC_VERTICAL_SCALE`.
- The older streets endpoint is not registered in the current server.
- The browser loads one default 3D Tiles part at a time through
  `VITE_DEFAULT_SELECTED_PART_ID`; the server-side API can normalize multiple
  comma-separated parts, but the current gallery map store only requests one.
- `npm run lint-modules` should be run after code or configuration changes.
