import { defineConfig, loadEnv } from "vite";
import pg from "pg";
import * as THREE from "three";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
Object.assign(
  process.env,
  loadEnv(process.env.NODE_ENV || "development", __dirname, ""),
);

function envString(name, fallback) {
  return process.env[name] ?? fallback;
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function envInteger(name, fallback) {
  return Math.trunc(envNumber(name, fallback));
}

function envPath(name, fallbackPath) {
  const value = process.env[name];
  if (!value) return join(__dirname, fallbackPath);
  return isAbsolute(value) ? value : join(__dirname, value);
}

function envNumberList(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;

  const numbers = value
    .split(",")
    .map((part) => Number(part.trim()));

  return numbers.length === fallback.length && numbers.every(Number.isFinite)
    ? numbers
    : fallback;
}

function envColorFactor(colorName, colorFallback, alphaName, alphaFallback) {
  const colorValue = envString(colorName, colorFallback).trim();
  const hex = colorValue.replace(/^#/, "");
  const parsed = /^[0-9a-fA-F]{6}$/.test(hex)
    ? Number.parseInt(hex, 16)
    : Number.parseInt(colorFallback.replace(/^#/, ""), 16);

  return [
    ((parsed >> 16) & 255) / 255,
    ((parsed >> 8) & 255) / 255,
    (parsed & 255) / 255,
    envNumber(alphaName, alphaFallback),
  ];
}

function shortHash(value) {
  return createHash("sha1").update(value).digest("hex").slice(0, 10);
}

const WEB_MAP_BASE_URL = envString(
  "WEB_MAP_BASE_URL",
  "https://www.3dcitydb.org/3dcitydb-web-map/2.0.0/",
);
const NYC_PARTS_CACHE_PATH = envPath(
  "NYC_PARTS_CACHE_PATH",
  join("data", "nycity-parts-cache.json"),
);
const NYC_PARTS_REFRESH_ON_START =
  envString("NYC_PARTS_REFRESH_ON_START", "false").toLowerCase() === "true";

const dbConfig = {
  host: envString("CITYDB_HOST", "127.0.0.1"),
  port: envInteger("CITYDB_PORT", 5434),
  database: envString("CITYDB_NAME", "citydb"),
  user: envString("CITYDB_USER", "citydb"),
  password: envString("CITYDB_PASSWORD", "changeMe"),
  options: envString(
    "CITYDB_OPTIONS",
    "-c max_parallel_workers_per_gather=0 -c jit=off",
  ),
};

const NYC_PART_COUNT = envInteger("NYC_PART_COUNT", 20);
const NYC_DEFAULT_PART_ID = envString("NYC_DEFAULT_PART_ID", "NYC_DA4");
const NYC_LOD = envString("NYC_LOD", "2");
const NYC_VERTICAL_SCALE = envNumber("NYC_VERTICAL_SCALE", 0.3048006096);
const NYC_HEIGHT_MODE = envString("CITYDB_HEIGHT_MODE", "relative");
const NYC_VERTICAL_OFFSET_METERS = envNumber("CITYDB_VERTICAL_OFFSET_METERS", 0);
const MAX_SURFACES_PER_RESPONSE = envInteger("MAX_SURFACES_PER_RESPONSE", 8000000);
const MAX_SURFACES_PER_PART = envInteger("MAX_SURFACES_PER_PART", 8000000);
const MIN_SURFACES_PER_PART = envInteger("MIN_SURFACES_PER_PART", 1500);
const MIN_QUERY_RADIUS_METERS = envNumber("MIN_QUERY_RADIUS_METERS", 2000);
const MAX_QUERY_RADIUS_METERS = envNumber("MAX_QUERY_RADIUS_METERS", 800000);
const TILESET_GRID_DIVISIONS = Math.max(1, envInteger("TILESET_GRID_DIVISIONS", 16));
const TILESET_ROOT_GEOMETRIC_ERROR = envNumber("TILESET_ROOT_GEOMETRIC_ERROR", 500);
const TILESET_PART_GEOMETRIC_ERROR = envNumber("TILESET_PART_GEOMETRIC_ERROR", 250);

const nycPartConfigs = Array.from({ length: NYC_PART_COUNT }, (_, index) => {
  const number = index + 1;
  return {
    id: `NYC_DA${number}`,
    label: `DA${number}`,
    detail: `New York City delivery area ${number}`,
    version: "CityGML 2.0",
    lod: NYC_LOD,
    verticalScale: NYC_VERTICAL_SCALE,
  };
});

const nycPartIds = new Set(nycPartConfigs.map((part) => part.id));
const nycPartConfigById = new Map(nycPartConfigs.map((part) => [part.id, part]));
let nycPartsCache = null;
let nycPartsCacheTime = 0;
const NYC_PARTS_CACHE_MS = envInteger("NYC_PARTS_CACHE_MS", 60000);
const geojsonResponseCache = new Map();
const GEOJSON_RESPONSE_CACHE_LIMIT = envInteger("GEOJSON_RESPONSE_CACHE_LIMIT", 24);
const GEOJSON_RESPONSE_CACHE_MS = envInteger("GEOJSON_RESPONSE_CACHE_MS", 120000);
const streetsResponseCache = new Map();
const STREETS_RESPONSE_CACHE_LIMIT = envInteger("STREETS_RESPONSE_CACHE_LIMIT", 48);
const STREETS_RESPONSE_CACHE_MS = envInteger("STREETS_RESPONSE_CACHE_MS", 60000);
const MAX_STREETS_PER_RESPONSE = envInteger("MAX_STREETS_PER_RESPONSE", 25000);
const STREETS_SIMPLIFY_TOLERANCE_DEGREES = envNumber(
  "STREETS_SIMPLIFY_TOLERANCE_DEGREES",
  0.000005,
);
const tileResponseCache = new Map();
const TILE_RESPONSE_CACHE_LIMIT = envInteger("TILE_RESPONSE_CACHE_LIMIT", 12);
const TILE_RESPONSE_CACHE_MS = envInteger("TILE_RESPONSE_CACHE_MS", 120000);
const TILE_BASE_COLOR_FACTOR = envNumberList(
  "TILE_BASE_COLOR_FACTOR",
  [1, 1, 1, 1],
);
const TILE_VERTEX_COLORS = {
  roof: envColorFactor("VITE_TILE_COLOR_ROOF", "#e7ff38", "VITE_TILE_ALPHA_ROOF", 1),
  wall: envColorFactor("VITE_TILE_COLOR_WALL", "#d8ff42", "VITE_TILE_ALPHA_WALL", 1),
  floor: envColorFactor("VITE_TILE_COLOR_FLOOR", "#c4f72f", "VITE_TILE_ALPHA_FLOOR", 1),
  opening: envColorFactor(
    "VITE_TILE_COLOR_OPENING",
    "#f2ff8a",
    "VITE_TILE_ALPHA_OPENING",
    1,
  ),
  road: envColorFactor("VITE_TILE_COLOR_ROAD", "#baff3d", "VITE_TILE_ALPHA_ROAD", 1),
  edge: envColorFactor("VITE_TILE_COLOR_EDGE", "#171c12", "VITE_TILE_ALPHA_EDGE", 1),
  other: envColorFactor(
    "VITE_TILE_COLOR_DEFAULT",
    "#dcff3f",
    "VITE_TILE_ALPHA_DEFAULT",
    1,
  ),
};
const TILE_EDGE_OFFSET_METERS = envNumber("TILE_EDGE_OFFSET_METERS", 0.15);
const TILE_GROUND_SURFACE_OFFSET_METERS = envNumber(
  "TILE_GROUND_SURFACE_OFFSET_METERS",
  0.35,
);
const TILESET_VERSION = envString(
  "TILESET_VERSION",
  `citydb-${shortHash(
    JSON.stringify({
      lod: NYC_LOD,
      heightMode: NYC_HEIGHT_MODE,
      verticalOffsetMeters: NYC_VERTICAL_OFFSET_METERS,
      baseColor: TILE_BASE_COLOR_FACTOR,
      vertexColors: TILE_VERTEX_COLORS,
      edgeOffsetMeters: TILE_EDGE_OFFSET_METERS,
      groundSurfaceOffsetMeters: TILE_GROUND_SURFACE_OFFSET_METERS,
      gridDivisions: TILESET_GRID_DIVISIONS,
      applyClientStyle: envString("VITE_APPLY_TILE_STYLE", "false"),
    }),
  )}`,
);
const TILE_HTTP_CACHE_CONTROL = envString("TILE_HTTP_CACHE_CONTROL", "no-store");
const DEV_SERVER_HOST = envString("DEV_SERVER_HOST", "127.0.0.1");

const cityStatsQuery = `
  select
    f.lineage as id,
    count(*)::int as features
  from citydb.feature f
  where f.lineage like 'NYC_DA%'
  group by f.lineage
  order by f.lineage;
`;

const lodStatsQuery = `
  select
    f.lineage as id,
    p.val_lod as lod,
    count(*)::int as geometries
  from citydb.property p
  join citydb.feature f on f.id = p.feature_id
  where p.val_geometry_id is not null
    and f.lineage like 'NYC_DA%'
  group by f.lineage, p.val_lod
  order by f.lineage, p.val_lod;
`;

const partBoundsQuery = `
  select
    f.lineage as id,
    min(ST_XMin(Box3D(f.envelope)))::float8 as "minLon",
    min(ST_YMin(Box3D(f.envelope)))::float8 as "minLat",
    min(ST_ZMin(Box3D(f.envelope)))::float8 as "minZ",
    max(ST_XMax(Box3D(f.envelope)))::float8 as "maxLon",
    max(ST_YMax(Box3D(f.envelope)))::float8 as "maxLat",
    max(ST_ZMax(Box3D(f.envelope)))::float8 as "maxZ"
  from citydb.feature f
  where f.lineage like 'NYC_DA%'
    and f.envelope is not null
    and ST_XMin(Box3D(f.envelope)) between -180 and 180
    and ST_XMax(Box3D(f.envelope)) between -180 and 180
    and ST_YMin(Box3D(f.envelope)) between -90 and 90
    and ST_YMax(Box3D(f.envelope)) between -90 and 90
  group by f.lineage
  order by f.lineage;
`;

function surfaceQuery(sqlFilter) {
  const filterClause = sqlFilter ? `and (${sqlFilter.sql})` : "";
  const includeBuildingMetrics = sqlFilterUsesBuildingMetrics(sqlFilter);
  const buildingMetricCtes = includeBuildingMetrics
    ? `,
  building_base as materialized (
    select
      b.lineage,
      b.id as building_id,
      ((ST_ZMax(Box3D(b.envelope)) - ST_ZMin(Box3D(b.envelope))) * ${NYC_VERTICAL_SCALE}) as height_m,
      ST_Area(ST_Envelope(b.envelope)::geography) as area_m2
    from requested_parts rp
    join citydb.feature b on b.lineage = rp.lineage
    join citydb.objectclass boc on boc.id = b.objectclass_id
    where boc.classname = 'Building'
      and b.envelope is not null
  ),
  building_metrics as materialized (
    select
      lineage,
      building_id,
      height_m,
      area_m2,
      row_number() over (partition by lineage order by height_m desc nulls last, building_id) as height_rank,
      row_number() over (partition by lineage order by area_m2 desc nulls last, building_id) as area_rank
    from building_base
  ),
  building_surface_metrics as materialized (
    select
      building_metrics.lineage,
      bp.val_feature_id as surface_id,
      building_metrics.height_m,
      building_metrics.area_m2,
      building_metrics.height_rank,
      building_metrics.area_rank
    from building_metrics
    join citydb.property bp on bp.feature_id = building_metrics.building_id
    where bp.name = 'boundary'
      and bp.val_feature_id is not null
  )`
    : "";
  const surfaceSourceSql = includeBuildingMetrics
    ? `
      from building_surface_metrics bm
      join citydb.property p on p.feature_id = bm.surface_id
      join citydb.geometry_data gd on gd.id = p.val_geometry_id
      join citydb.feature f on f.id = bm.surface_id
      join citydb.objectclass oc on oc.id = f.objectclass_id
      where bm.lineage = rp.lineage
        and f.lineage = rp.lineage`
    : `
      from citydb.property p
      join citydb.geometry_data gd on gd.id = p.val_geometry_id
      join citydb.feature f on f.id = p.feature_id
      join citydb.objectclass oc on oc.id = f.objectclass_id
      where f.lineage = rp.lineage`;

  return `
  with requested_parts as (
    select unnest($1::text[]) as lineage
  ),
  query_window as (
    select ST_MakeEnvelope($4, $5, $6, $7, 4326) as geom
  )${buildingMetricCtes},
  limited_geoms as (
    select
      selected.lineage,
      selected.lod,
      selected.property_name,
      selected.geometry_id,
      selected.feature_id,
      selected.objectid,
      selected.classname,
      selected.geometry
    from requested_parts rp
    join lateral (
      select
        f.lineage,
        p.val_lod as lod,
        p.name as property_name,
        gd.id as geometry_id,
        f.id as feature_id,
        f.objectid,
        oc.classname,
        gd.geometry
      ${surfaceSourceSql}
        and p.val_lod = $2
        and gd.geometry is not null
        ${filterClause}
        and gd.geometry && (select geom from query_window)
        and ST_Intersects(gd.geometry, (select geom from query_window))
      order by f.id, gd.id
      limit $3
    ) selected on true
  ),
  polygon_geoms as (
    select
      limited_geoms.lineage,
      limited_geoms.geometry_id,
      limited_geoms.feature_id,
      limited_geoms.objectid,
      limited_geoms.classname,
      limited_geoms.lod,
      limited_geoms.property_name,
      dumped.geom
    from limited_geoms
    cross join lateral ST_Dump(limited_geoms.geometry) as dumped
    where ST_GeometryType(dumped.geom) = 'ST_Polygon'
  )
  select
    lineage,
    geometry_id,
    feature_id,
    objectid,
    classname,
    lod,
    property_name,
    ST_AsGeoJSON(ST_Scale(geom, 1, 1, $8), 7, 0)::json as geojson
  from polygon_geoms
  order by lineage, feature_id, geometry_id;
`;
}

class SqlFilterError extends Error {
  constructor(message) {
    super(message);
    this.name = "SqlFilterError";
    this.statusCode = 400;
  }
}

function sqlFilterFromUrl(url) {
  return normalizeSqlFilter(url.searchParams.get("where"));
}

function sqlFilterUsesBuildingMetrics(sqlFilter) {
  return Boolean(sqlFilter?.sql && /\bbm\s*\./i.test(sqlFilter.sql));
}

function normalizeSqlFilter(value) {
  const sql = String(value || "")
    .trim()
    .replace(/^where\s+/i, "")
    .trim();

  if (!sql) return null;

  if (sql.length > 4000) {
    throw new SqlFilterError("SQL WHERE filter is too long");
  }

  if (/;|--|\/\*|\*\//.test(sql)) {
    throw new SqlFilterError("SQL WHERE filter cannot include semicolons or comments");
  }

  if (
    /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|vacuum|copy|call|do|execute)\b/i.test(
      sql,
    )
  ) {
    throw new SqlFilterError("SQL WHERE filter must be a read-only condition");
  }

  return {
    sql,
    hash: shortHash(sql),
  };
}

async function validateSqlFilter(pool, sqlFilter, partIds = [NYC_DEFAULT_PART_ID]) {
  if (!sqlFilter) return;
  const includeBuildingMetrics = sqlFilterUsesBuildingMetrics(sqlFilter);
  const buildingMetricCtes = includeBuildingMetrics
    ? `,
    building_base as materialized (
      select
        b.lineage,
        b.id as building_id,
        ((ST_ZMax(Box3D(b.envelope)) - ST_ZMin(Box3D(b.envelope))) * ${NYC_VERTICAL_SCALE}) as height_m,
        ST_Area(ST_Envelope(b.envelope)::geography) as area_m2
      from requested_parts rp
      join citydb.feature b on b.lineage = rp.lineage
      join citydb.objectclass boc on boc.id = b.objectclass_id
      where boc.classname = 'Building'
        and b.envelope is not null
    ),
    building_metrics as materialized (
      select
        lineage,
        building_id,
        height_m,
        area_m2,
        row_number() over (partition by lineage order by height_m desc nulls last, building_id) as height_rank,
        row_number() over (partition by lineage order by area_m2 desc nulls last, building_id) as area_rank
      from building_base
    ),
    building_surface_metrics as materialized (
      select
        building_metrics.lineage,
        bp.val_feature_id as surface_id,
        building_metrics.height_m,
        building_metrics.area_m2,
        building_metrics.height_rank,
        building_metrics.area_rank
      from building_metrics
      join citydb.property bp on bp.feature_id = building_metrics.building_id
      where bp.name = 'boundary'
        and bp.val_feature_id is not null
    )`
    : "";
  const buildingMetricJoins = includeBuildingMetrics
    ? `
    join building_surface_metrics bm on bm.surface_id = f.id
      and bm.lineage = f.lineage`
    : "";

  const sql = `
    with requested_parts as (
      select unnest($1::text[]) as lineage
    )${buildingMetricCtes}
    select 1
    from citydb.property p
    join citydb.geometry_data gd on gd.id = p.val_geometry_id
    join citydb.feature f on f.id = p.feature_id
    join citydb.objectclass oc on oc.id = f.objectclass_id
    ${buildingMetricJoins}
    where f.lineage in (select lineage from requested_parts)
      and ${sqlFilter.sql}
    limit 1;
  `;

  try {
    await pool.query(sql, [partIds]);
  } catch (error) {
    if (error?.code && /^[0-9A-Z]{5}$/.test(String(error.code))) {
      throw new SqlFilterError(
        `Invalid SQL WHERE filter. Use aliases f, p, gd, oc, and bm. ${error.message}`,
      );
    }
    throw error;
  }
}

const statsQuery = `
  select json_build_object(
    'features', (
      select count(*)::int
      from citydb.feature
      where lineage = any($1::text[])
    ),
    'geometries', (
      select count(*)::int
      from citydb.geometry_data gd
      join citydb.feature f on f.id = gd.feature_id
      where f.lineage = any($1::text[])
    ),
    'buildings', (
      select count(*)::int
      from citydb.feature f
      join citydb.objectclass oc on oc.id = f.objectclass_id
      where f.lineage = any($1::text[])
        and oc.classname = 'Building'
    ),
    'selectedLodGeometries', (
      select count(*)::int
      from citydb.property p
      join citydb.feature f on f.id = p.feature_id
      where f.lineage = any($1::text[])
        and p.val_lod = $2
        and p.val_geometry_id is not null
    )
  ) as stats;
`;

const streetsQuery = `
  with query_window as (
    select ST_MakeEnvelope($1, $2, $3, $4, 4326) as geom
  ),
  selected as (
    select
      s.gid,
      s.nysstreeti,
      s.completest,
      s.streetname,
      s.posttype,
      s.highwaynum,
      s.label,
      s.fcc,
      s.acc,
      s.speed,
      s.oneway,
      s.leftcounty,
      s.rightcount,
      s.status,
      case
        when $6::float8 > 0 then ST_SimplifyPreserveTopology(s.geom, $6::float8)
        else s.geom
      end as geom
    from city_layers.nyc_streets s
    join query_window qw
      on s.geom && qw.geom
      and ST_Intersects(s.geom, qw.geom)
    where s.geom is not null
    order by s.gid
    limit ($5::int + 1)
  )
  select
    gid,
    nysstreeti,
    completest,
    streetname,
    posttype,
    highwaynum,
    label,
    fcc,
    acc,
    speed,
    oneway,
    leftcounty,
    rightcount,
    status,
    ST_AsGeoJSON(geom, 6, 0)::json as geojson
  from selected
  where not ST_IsEmpty(geom)
  order by gid;
`;

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
}

function sendJsonText(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(body);
}

function sendApiError(res, error, { includeDatabase = false } = {}) {
  const statusCode = Number(error?.statusCode) || 500;
  const body = {
    error: error.message,
  };

  if (includeDatabase && statusCode >= 500) {
    body.database = {
      host: dbConfig.host,
      port: dbConfig.port,
      name: dbConfig.database,
    };
  }

  sendJson(res, statusCode, body);
}

function sendHtml(res, fileName) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(readFileSync(join(__dirname, fileName), "utf8"));
}

function readJsonFile(fileName) {
  return JSON.parse(readFileSync(fileName, "utf8").replace(/^\uFEFF/, ""));
}

function getCachedJson(cacheKey) {
  const entry = geojsonResponseCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > GEOJSON_RESPONSE_CACHE_MS) {
    geojsonResponseCache.delete(cacheKey);
    return null;
  }
  return entry.body;
}

function setCachedJson(cacheKey, body) {
  geojsonResponseCache.set(cacheKey, {
    body,
    createdAt: Date.now(),
  });

  while (geojsonResponseCache.size > GEOJSON_RESPONSE_CACHE_LIMIT) {
    const firstKey = geojsonResponseCache.keys().next().value;
    geojsonResponseCache.delete(firstKey);
  }
}

function getCachedStreetsJson(cacheKey) {
  const entry = streetsResponseCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > STREETS_RESPONSE_CACHE_MS) {
    streetsResponseCache.delete(cacheKey);
    return null;
  }
  return entry.body;
}

function setCachedStreetsJson(cacheKey, body) {
  streetsResponseCache.set(cacheKey, {
    body,
    createdAt: Date.now(),
  });

  while (streetsResponseCache.size > STREETS_RESPONSE_CACHE_LIMIT) {
    const firstKey = streetsResponseCache.keys().next().value;
    streetsResponseCache.delete(firstKey);
  }
}

function getCachedTile(cacheKey) {
  const entry = tileResponseCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TILE_RESPONSE_CACHE_MS) {
    tileResponseCache.delete(cacheKey);
    return null;
  }
  return entry.body;
}

function setCachedTile(cacheKey, body) {
  tileResponseCache.set(cacheKey, {
    body,
    createdAt: Date.now(),
  });

  while (tileResponseCache.size > TILE_RESPONSE_CACHE_LIMIT) {
    const firstKey = tileResponseCache.keys().next().value;
    tileResponseCache.delete(firstKey);
  }
}

function sendBinary(res, statusCode, body, contentType) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", TILE_HTTP_CACHE_CONTROL);
  res.end(body);
}

function sendCorsPreflight(res) {
  res.statusCode = 204;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end();
}

async function proxyWebMapClient(req, res) {
  const url = new URL(req.url || "", "http://localhost");
  const clientPath = url.pathname.replace(/^\/3dcitydb-client\/?/, "");
  const remoteUrl = new URL(clientPath || "3dwebclient/index.html", WEB_MAP_BASE_URL);
  remoteUrl.search = url.search;

  try {
    const response = await fetch(remoteUrl);
    if (!response.ok) {
      res.statusCode = response.status;
      res.end(await response.text());
      return;
    }

    res.statusCode = response.status;
    const contentType = response.headers.get("content-type");
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    sendJson(res, 502, {
      error: `Could not proxy 3DCityDB Web Map Client: ${error.message}`,
    });
  }
}

function sortPartIds(ids) {
  return [...ids].sort((left, right) => {
    const leftNumber = Number(left.replace("NYC_DA", ""));
    const rightNumber = Number(right.replace("NYC_DA", ""));
    return leftNumber - rightNumber;
  });
}

function normalizePartIds(partsParam) {
  const requestedIds = partsParam
    ? partsParam
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
    : [NYC_DEFAULT_PART_ID];

  return sortPartIds([...new Set(requestedIds)].filter((id) => nycPartIds.has(id)));
}

function limitPerPart(partCount) {
  return Math.min(
    MAX_SURFACES_PER_PART,
    Math.max(
      MIN_SURFACES_PER_PART,
      Math.floor(MAX_SURFACES_PER_RESPONSE / Math.max(partCount, 1)),
    ),
  );
}

function numberParam(url, name) {
  if (!url.searchParams.has(name)) return null;
  const value = Number(url.searchParams.get(name));
  return Number.isFinite(value) ? value : null;
}

function integerParam(url, name) {
  const value = numberParam(url, name);
  return value === null ? null : Math.trunc(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function boundedLimit(url, name, fallback, max) {
  const requestedLimit = integerParam(url, name) ?? fallback;
  return clamp(requestedLimit, 1, max);
}

function spatialWindowFromUrl(url) {
  const bboxParamNames = ["minLon", "minLat", "maxLon", "maxLat"];
  const hasBboxParams = bboxParamNames.some((name) => url.searchParams.has(name));
  if (hasBboxParams) {
    const minLon = numberParam(url, "minLon");
    const minLat = numberParam(url, "minLat");
    const maxLon = numberParam(url, "maxLon");
    const maxLat = numberParam(url, "maxLat");

    if ([minLon, minLat, maxLon, maxLat].some((value) => value === null)) {
      return null;
    }

    const west = clamp(Math.min(minLon, maxLon), -180, 180);
    const south = clamp(Math.min(minLat, maxLat), -90, 90);
    const east = clamp(Math.max(minLon, maxLon), -180, 180);
    const north = clamp(Math.max(minLat, maxLat), -90, 90);

    if (west === east || south === north) {
      return null;
    }

    return {
      lon: (west + east) / 2,
      lat: (south + north) / 2,
      radiusMeters: 0,
      minLon: west,
      minLat: south,
      maxLon: east,
      maxLat: north,
    };
  }

  const lon = numberParam(url, "lon");
  const lat = numberParam(url, "lat");
  const requestedRadius = numberParam(url, "radius");

  if (lon === null || lat === null || requestedRadius === null) {
    return null;
  }

  const radiusMeters = clamp(
    requestedRadius,
    MIN_QUERY_RADIUS_METERS,
    MAX_QUERY_RADIUS_METERS,
  );
  const latDelta = radiusMeters / 111320;
  const lonDelta =
    radiusMeters / Math.max(111320 * Math.cos((lat * Math.PI) / 180), 1);

  return {
    lon,
    lat,
    radiusMeters,
    minLon: lon - lonDelta,
    minLat: lat - latDelta,
    maxLon: lon + lonDelta,
    maxLat: lat + latDelta,
  };
}

function spatialWindowFromParts(parts) {
  const bounds = parts
    .map((part) => part.bounds)
    .filter(Boolean)
    .reduce(
      (acc, bounds) => ({
        minLon: Math.min(acc.minLon, bounds.minLon),
        minLat: Math.min(acc.minLat, bounds.minLat),
        maxLon: Math.max(acc.maxLon, bounds.maxLon),
        maxLat: Math.max(acc.maxLat, bounds.maxLat),
      }),
      {
        minLon: Infinity,
        minLat: Infinity,
        maxLon: -Infinity,
        maxLat: -Infinity,
      },
    );

  if (!Number.isFinite(bounds.minLon)) return null;

  const lon = (bounds.minLon + bounds.maxLon) / 2;
  const lat = (bounds.minLat + bounds.maxLat) / 2;
  const latSpanMeters = (bounds.maxLat - bounds.minLat) * 111320;
  const lonSpanMeters =
    (bounds.maxLon - bounds.minLon) *
    Math.max(111320 * Math.cos((lat * Math.PI) / 180), 1);

  return {
    lon,
    lat,
    radiusMeters: Math.max(latSpanMeters, lonSpanMeters) / 2,
    ...bounds,
  };
}

async function getNycParts(pool) {
  if (nycPartsCache && Date.now() - nycPartsCacheTime < NYC_PARTS_CACHE_MS) {
    return nycPartsCache;
  }

  if (!NYC_PARTS_REFRESH_ON_START && existsSync(NYC_PARTS_CACHE_PATH)) {
    const cachedPayload = readJsonFile(NYC_PARTS_CACHE_PATH);
    nycPartsCache = cachedPayload.parts;
    nycPartsCacheTime = Date.now();
    return nycPartsCache;
  }

  try {
    return await refreshNycParts(pool);
  } catch (error) {
    if (existsSync(NYC_PARTS_CACHE_PATH)) {
      const cachedPayload = readJsonFile(NYC_PARTS_CACHE_PATH);
      nycPartsCache = cachedPayload.parts;
      nycPartsCacheTime = Date.now();
      return nycPartsCache;
    }
    throw error;
  }
}

async function refreshNycParts(pool) {
  const [cityStatsResult, partBoundsResult] = await Promise.all([
    pool.query(cityStatsQuery),
    pool.query(partBoundsQuery),
  ]);

  const cityStats = new Map(cityStatsResult.rows.map((row) => [row.id, row]));
  const partBounds = new Map(partBoundsResult.rows.map((row) => [row.id, row]));

  nycPartsCache = nycPartConfigs.map((part) => {
    const stats = cityStats.get(part.id);
    const bounds = partBounds.get(part.id);
    return {
      ...part,
      imported: Boolean(stats && bounds),
      bounds: bounds
        ? {
          minLon: bounds.minLon,
          minLat: bounds.minLat,
          minZ: bounds.minZ || 0,
          maxLon: bounds.maxLon,
          maxLat: bounds.maxLat,
          maxZ: bounds.maxZ || 0,
          centerLon: (bounds.minLon + bounds.maxLon) / 2,
          centerLat: (bounds.minLat + bounds.maxLat) / 2,
        }
        : null,
      stats: {
        features: stats?.features || 0,
        buildings: 0,
        lods: [],
      },
    };
  });
  nycPartsCacheTime = Date.now();
  writeFileSync(
    NYC_PARTS_CACHE_PATH,
    JSON.stringify(buildPartsPayload(nycPartsCache), null, 2),
  );
  return nycPartsCache;
}

function buildPartsPayload(parts) {
  return {
    database: {
      host: dbConfig.host,
      port: dbConfig.port,
      name: dbConfig.database,
      schema: "citydb",
    },
    dataset: {
      id: "NYC",
      label: "New York City",
      detail: "CityGML 2.0 LoD2 delivery areas imported into 3DCityDB",
      lod: NYC_LOD,
      version: "CityGML 2.0",
      verticalScale: NYC_VERTICAL_SCALE,
    },
    parts,
  };
}

function emptyStats(surfaces, capped, limitPerPart) {
  return {
    features: 0,
    geometries: 0,
    buildings: 0,
    selectedLodGeometries: 0,
    surfaces,
    capped,
    limitPerPart,
  };
}

async function getSurfaceData(
  pool,
  requestedPartIds,
  requestedView,
  { includeStats = true, outputVerticalScale = 1, sqlFilter = null } = {},
) {
  const importedParts = await getNycParts(pool);
  const importedPartMap = new Map(
    importedParts.filter((part) => part.imported).map((part) => [part.id, part]),
  );
  const partIds = requestedPartIds.filter((partId) => importedPartMap.has(partId));
  const parts = partIds.map((id) => importedPartMap.get(id));
  const view = requestedView || spatialWindowFromParts(parts);

  if (partIds.length === 0 || !view) {
    return {
      partIds,
      parts,
      view,
      stats: {
        features: 0,
        geometries: 0,
        buildings: 0,
        selectedLodGeometries: 0,
        surfaces: 0,
        capped: false,
        limitPerPart: 0,
      },
      surfaces: [],
    };
  }

  await validateSqlFilter(pool, sqlFilter, partIds);

  const perPartLimit = limitPerPart(partIds.length);
  const surfaceResultPromise = pool.query(surfaceQuery(sqlFilter), [
    partIds,
    NYC_LOD,
    perPartLimit,
    view.minLon,
    view.minLat,
    view.maxLon,
    view.maxLat,
    outputVerticalScale,
  ]);
  const statsResultPromise = includeStats
    ? pool.query(statsQuery, [partIds, NYC_LOD])
    : Promise.resolve(null);

  const [statsResult, surfaceResult] = await Promise.all([
    statsResultPromise,
    surfaceResultPromise,
  ]);

  const surfaces = surfaceResult.rows.map((row) => ({
    partId: row.lineage,
    geometryId: row.geometry_id,
    featureId: row.feature_id,
    objectId: row.objectid,
    className: row.classname,
    lod: row.lod,
    property: row.property_name,
    rings: row.geojson.coordinates,
    geojson: row.geojson,
  }));

  return {
    partIds,
    parts,
    view,
    stats: includeStats
      ? {
        ...statsResult.rows[0].stats,
        surfaces: surfaces.length,
        capped:
          surfaces.length >= perPartLimit * partIds.length ||
          Number(statsResult.rows[0].stats.selectedLodGeometries) >
          surfaces.length,
        limitPerPart: perPartLimit,
      }
      : emptyStats(
        surfaces.length,
        surfaces.length >= perPartLimit * partIds.length,
        perPartLimit,
      ),
    surfaces,
  };
}

async function getRequestedImportedParts(pool, requestedPartIds) {
  const importedParts = await getNycParts(pool);
  const importedPartMap = new Map(
    importedParts.filter((part) => part.imported).map((part) => [part.id, part]),
  );
  return requestedPartIds
    .map((partId) => importedPartMap.get(partId))
    .filter(Boolean);
}

function basePayload(surfaceData) {
  return {
    name: "New York City",
    lod: NYC_LOD,
    version: "CityGML 2.0",
    verticalScale: NYC_VERTICAL_SCALE,
    heightMode: NYC_HEIGHT_MODE,
    verticalOffsetMeters: NYC_VERTICAL_OFFSET_METERS,
    parts: surfaceData.parts,
    provider: "Local 3DCityDB",
    database: {
      host: dbConfig.host,
      port: dbConfig.port,
      name: dbConfig.database,
      schema: "citydb",
    },
    view: surfaceData.view,
    stats: surfaceData.stats,
  };
}

async function getStreetData(pool, view, limit) {
  const result = await pool.query(streetsQuery, [
    view.minLon,
    view.minLat,
    view.maxLon,
    view.maxLat,
    limit,
    STREETS_SIMPLIFY_TOLERANCE_DEGREES,
  ]);
  const capped = result.rows.length > limit;
  const rows = capped ? result.rows.slice(0, limit) : result.rows;

  return {
    view,
    limit,
    capped,
    streets: rows.map((row) => ({
      gid: row.gid,
      nysStreetId: row.nysstreeti,
      completeStreet: row.completest,
      streetName: row.streetname,
      postType: row.posttype,
      highwayNumber: row.highwaynum,
      label: row.label,
      fcc: row.fcc,
      access: row.acc,
      speed: row.speed,
      oneWay: row.oneway,
      leftCounty: row.leftcounty,
      rightCounty: row.rightcount,
      status: row.status,
      geojson: row.geojson,
    })),
  };
}

function streetsPayload(streetData) {
  return {
    type: "FeatureCollection",
    name: "NYC Streets",
    metadata: {
      source: "NYS Streets",
      provider: "Local PostGIS",
      database: {
        host: dbConfig.host,
        port: dbConfig.port,
        name: dbConfig.database,
        schema: "city_layers",
        table: "nyc_streets",
      },
      crs: "EPSG:4326",
      view: streetData.view,
      stats: {
        streets: streetData.streets.length,
        capped: streetData.capped,
        limit: streetData.limit,
      },
    },
    features: streetData.streets.map(({ geojson, ...street }) => ({
      type: "Feature",
      id: street.gid,
      properties: street,
      geometry: geojson,
    })),
  };
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function unionBounds(parts) {
  const bounds = parts
    .map((part) => part.bounds)
    .filter(Boolean)
    .reduce(
      (acc, partBounds) => ({
        minLon: Math.min(acc.minLon, partBounds.minLon),
        minLat: Math.min(acc.minLat, partBounds.minLat),
        minZ: Math.min(acc.minZ, Number(partBounds.minZ || 0)),
        maxLon: Math.max(acc.maxLon, partBounds.maxLon),
        maxLat: Math.max(acc.maxLat, partBounds.maxLat),
        maxZ: Math.max(acc.maxZ, Number(partBounds.maxZ || 0)),
      }),
      {
        minLon: Infinity,
        minLat: Infinity,
        minZ: Infinity,
        maxLon: -Infinity,
        maxLat: -Infinity,
        maxZ: -Infinity,
      },
    );

  return Number.isFinite(bounds.minLon) ? bounds : null;
}

function partVerticalOffsetMeters(part) {
  const groundOffset =
    NYC_HEIGHT_MODE === "relative"
      ? -Number(part.bounds?.minZ || 0) * NYC_VERTICAL_SCALE
      : 0;
  return groundOffset + NYC_VERTICAL_OFFSET_METERS;
}

function verticalOffsetForParts(parts) {
  if (parts.length === 0) return NYC_VERTICAL_OFFSET_METERS;
  if (parts.length === 1) return partVerticalOffsetMeters(parts[0]);

  const minZ = Math.min(
    ...parts.map((part) => Number(part.bounds?.minZ || 0)),
  );
  const groundOffset =
    NYC_HEIGHT_MODE === "relative" ? -minZ * NYC_VERTICAL_SCALE : 0;
  return groundOffset + NYC_VERTICAL_OFFSET_METERS;
}

function regionFromBounds(bounds, verticalOffsetMeters = 0) {
  const minHeight = Number.isFinite(bounds.minZ)
    ? bounds.minZ * NYC_VERTICAL_SCALE + verticalOffsetMeters
    : 0;
  const maxHeight = Number.isFinite(bounds.maxZ)
    ? bounds.maxZ * NYC_VERTICAL_SCALE + verticalOffsetMeters
    : minHeight + 1;

  return [
    degreesToRadians(bounds.minLon),
    degreesToRadians(bounds.minLat),
    degreesToRadians(bounds.maxLon),
    degreesToRadians(bounds.maxLat),
    minHeight,
    Math.max(maxHeight, minHeight + 1),
  ];
}

function regionFromParts(parts) {
  const bounds = unionBounds(parts);
  if (!bounds) return null;

  const heightRanges = parts
    .filter((part) => part.bounds)
    .map((part) => {
      const verticalOffsetMeters = partVerticalOffsetMeters(part);
      return {
        minHeight: Number(part.bounds.minZ || 0) * NYC_VERTICAL_SCALE + verticalOffsetMeters,
        maxHeight: Number(part.bounds.maxZ || 0) * NYC_VERTICAL_SCALE + verticalOffsetMeters,
      };
    });

  const minHeight = Math.min(...heightRanges.map((range) => range.minHeight));
  const maxHeight = Math.max(...heightRanges.map((range) => range.maxHeight));

  return [
    degreesToRadians(bounds.minLon),
    degreesToRadians(bounds.minLat),
    degreesToRadians(bounds.maxLon),
    degreesToRadians(bounds.maxLat),
    minHeight,
    Math.max(maxHeight, minHeight + 1),
  ];
}

function geodeticToEcef(lon, lat, height = 0) {
  const longitude = degreesToRadians(lon);
  const latitude = degreesToRadians(lat);
  const semiMajorAxis = 6378137.0;
  const flattening = 1 / 298.257223563;
  const eccentricitySquared = flattening * (2 - flattening);
  const sinLat = Math.sin(latitude);
  const cosLat = Math.cos(latitude);
  const sinLon = Math.sin(longitude);
  const cosLon = Math.cos(longitude);
  const normal =
    semiMajorAxis / Math.sqrt(1 - eccentricitySquared * sinLat * sinLat);

  return new THREE.Vector3(
    (normal + height) * cosLat * cosLon,
    (normal + height) * cosLat * sinLon,
    (normal * (1 - eccentricitySquared) + height) * sinLat,
  );
}

function localFrameForParts(parts, verticalOffsetMeters = verticalOffsetForParts(parts)) {
  const bounds = unionBounds(parts);
  if (!bounds) return null;

  const lon = (bounds.minLon + bounds.maxLon) / 2;
  const lat = (bounds.minLat + bounds.maxLat) / 2;
  const longitude = degreesToRadians(lon);
  const latitude = degreesToRadians(lat);
  const sinLat = Math.sin(latitude);
  const cosLat = Math.cos(latitude);
  const sinLon = Math.sin(longitude);
  const cosLon = Math.cos(longitude);
  const origin = geodeticToEcef(lon, lat, 0);
  const east = new THREE.Vector3(-sinLon, cosLon, 0);
  const north = new THREE.Vector3(-sinLat * cosLon, -sinLat * sinLon, cosLat);
  const up = new THREE.Vector3(cosLat * cosLon, cosLat * sinLon, sinLat);

  return {
    bounds,
    lon,
    lat,
    origin,
    east,
    north,
    up,
    verticalOffsetMeters,
    transform: [
      east.x,
      east.y,
      east.z,
      0,
      north.x,
      north.y,
      north.z,
      0,
      up.x,
      up.y,
      up.z,
      0,
      origin.x,
      origin.y,
      origin.z,
      1,
    ],
  };
}

function tileBoundsForPart(part) {
  if (!part.bounds) return [];

  const { bounds } = part;
  const lonSpan = bounds.maxLon - bounds.minLon;
  const latSpan = bounds.maxLat - bounds.minLat;
  if (lonSpan <= 0 || latSpan <= 0) return [];

  const lonStep = lonSpan / TILESET_GRID_DIVISIONS;
  const latStep = latSpan / TILESET_GRID_DIVISIONS;
  const tiles = [];

  for (let y = 0; y < TILESET_GRID_DIVISIONS; y += 1) {
    for (let x = 0; x < TILESET_GRID_DIVISIONS; x += 1) {
      tiles.push({
        id: `${part.id}-${x}-${y}`,
        bounds: {
          minLon: bounds.minLon + lonStep * x,
          minLat: bounds.minLat + latStep * y,
          minZ: bounds.minZ,
          maxLon:
            x === TILESET_GRID_DIVISIONS - 1
              ? bounds.maxLon
              : bounds.minLon + lonStep * (x + 1),
          maxLat:
            y === TILESET_GRID_DIVISIONS - 1
              ? bounds.maxLat
              : bounds.minLat + latStep * (y + 1),
          maxZ: bounds.maxZ,
        },
      });
    }
  }

  return tiles;
}

function tileUriForPart(part, sqlFilter, bounds = null) {
  const url = new URL("http://localhost/tile.b3dm");
  url.searchParams.set("parts", part.id);
  url.searchParams.set("heightMode", NYC_HEIGHT_MODE);
  url.searchParams.set("style", TILESET_VERSION);
  if (bounds) {
    url.searchParams.set("minLon", bounds.minLon.toString());
    url.searchParams.set("minLat", bounds.minLat.toString());
    url.searchParams.set("maxLon", bounds.maxLon.toString());
    url.searchParams.set("maxLat", bounds.maxLat.toString());
  }
  if (sqlFilter) {
    url.searchParams.set("where", sqlFilter.sql);
  }
  if (NYC_VERTICAL_OFFSET_METERS !== 0) {
    url.searchParams.set("zOffset", NYC_VERTICAL_OFFSET_METERS.toString());
  }
  return `${url.pathname.slice(1)}${url.search}`;
}

function buildTileset(parts, sqlFilter = null) {
  const rootRegion = regionFromParts(parts);
  if (!rootRegion) {
    throw new Error("No imported New York City parts have valid bounds");
  }
  const tilesetVersion = sqlFilter
    ? `${TILESET_VERSION}-${sqlFilter.hash}`
    : TILESET_VERSION;

  return {
    asset: {
      version: "1.0",
      tilesetVersion,
      gltfUpAxis: "Y",
    },
    geometricError: TILESET_ROOT_GEOMETRIC_ERROR,
    root: {
      boundingVolume: {
        region: rootRegion,
      },
      geometricError: TILESET_ROOT_GEOMETRIC_ERROR,
      refine: "REPLACE",
      children: parts.map((part) => {
        const verticalOffsetMeters = partVerticalOffsetMeters(part);
        const frame = localFrameForParts([part], verticalOffsetMeters);
        const children = tileBoundsForPart(part).map((tile) => ({
          boundingVolume: {
            region: regionFromBounds(tile.bounds, verticalOffsetMeters),
          },
          geometricError: 0,
          refine: "REPLACE",
          transform: frame.transform,
          content: {
            uri: tileUriForPart(part, sqlFilter, tile.bounds),
          },
        }));

        return {
          boundingVolume: {
            region: regionFromBounds(frame.bounds, verticalOffsetMeters),
          },
          geometricError: TILESET_PART_GEOMETRIC_ERROR,
          refine: "REPLACE",
          children,
        };
      }),
    },
    properties: {
      partId: {},
      geometryId: {},
      featureId: {},
      objectId: {},
      className: {},
      lod: {},
      property: {},
      surfaceType: {},
    },
  };
}

function isValidPosition(position) {
  return (
    Array.isArray(position) &&
    position.length >= 2 &&
    Number.isFinite(position[0]) &&
    Number.isFinite(position[1]) &&
    Number.isFinite(position[2] ?? 0) &&
    Math.abs(position[0]) <= 180 &&
    Math.abs(position[1]) <= 90
  );
}

function positionsEqual(a, b) {
  return (
    Math.abs(a[0] - b[0]) < 0.000000001 &&
    Math.abs(a[1] - b[1]) < 0.000000001 &&
    Math.abs((a[2] ?? 0) - (b[2] ?? 0)) < 0.000001
  );
}

function normalizedRing(ring) {
  if (!Array.isArray(ring)) return null;

  const positions = ring.filter(isValidPosition);
  if (positions.length < 4) return null;

  if (positionsEqual(positions[0], positions.at(-1))) {
    positions.pop();
  }

  const uniquePositions = new Set(
    positions.map(([lon, lat, z = 0]) => `${lon.toFixed(9)},${lat.toFixed(9)},${z.toFixed(4)}`),
  );

  return uniquePositions.size >= 3 ? positions : null;
}

function classifySurface(surface) {
  const className = String(surface.className || "").toLowerCase();
  const objectId = String(surface.objectId || "").toLowerCase();
  const value = `${className} ${objectId}`;

  if (value.includes("roof")) return "roof";
  if (value.includes("wall")) return "wall";
  if (
    value.includes("floor") ||
    value.includes("ceiling") ||
    value.includes("ground")
  ) {
    return "floor";
  }
  if (value.includes("window") || value.includes("door")) return "opening";
  if (
    value.includes("road") ||
    value.includes("traffic") ||
    value.includes("intersection")
  ) {
    return "road";
  }

  return "other";
}

function enuPointFromPosition(position, frame, surfaceOffsetMeters = 0) {
  const height =
    (position[2] || 0) + frame.verticalOffsetMeters + surfaceOffsetMeters;
  const ecef = geodeticToEcef(position[0], position[1], height);
  const delta = ecef.sub(frame.origin);

  return new THREE.Vector3(
    delta.dot(frame.east),
    delta.dot(frame.north),
    delta.dot(frame.up),
  );
}

function gltfPointFromEnu(point) {
  return new THREE.Vector3(point.x, point.z, -point.y);
}

function newellNormal(points) {
  const normal = new THREE.Vector3();
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    normal.x += (current.y - next.y) * (current.z + next.z);
    normal.y += (current.z - next.z) * (current.x + next.x);
    normal.z += (current.x - next.x) * (current.y + next.y);
  }
  return normal.normalize();
}

function projectPolygon(points) {
  const normal = newellNormal(points);
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);

  if (ax >= ay && ax >= az) {
    return points.map((point) => new THREE.Vector2(point.y, point.z));
  }

  if (ay >= ax && ay >= az) {
    return points.map((point) => new THREE.Vector2(point.x, point.z));
  }

  return points.map((point) => new THREE.Vector2(point.x, point.y));
}

function pushTriangle(vertices, normals, colors, batchIds, batchId, color, a, b, c) {
  const edgeA = new THREE.Vector3().subVectors(b, a);
  const edgeB = new THREE.Vector3().subVectors(c, a);
  const normal = new THREE.Vector3().crossVectors(edgeA, edgeB);
  if (normal.lengthSq() > 0) {
    normal.normalize();
  } else {
    normal.set(0, 1, 0);
  }

  for (const point of [a, b, c]) {
    vertices.push(point.x, point.y, point.z);
    normals.push(normal.x, normal.y, normal.z);
    colors.push(...color);
    batchIds.push(batchId);
  }
}

function pushLineSegment(vertices, colors, color, a, b) {
  for (const point of [a, b]) {
    vertices.push(point.x, point.y, point.z);
    colors.push(...color);
  }
}

function meshFromSurfaces(surfaces, frame) {
  const vertices = [];
  const normals = [];
  const colors = [];
  const batchIds = [];
  const lineVertices = [];
  const lineColors = [];
  const batches = [];
  let skipped = 0;

  for (const surface of surfaces) {
    const surfaceType = classifySurface(surface);
    const surfaceColor = TILE_VERTEX_COLORS[surfaceType] || TILE_VERTEX_COLORS.other;
    const surfaceOffsetMeters =
      surfaceType === "floor" ? TILE_GROUND_SURFACE_OFFSET_METERS : 0;
    const rings = (surface.rings || []).map(normalizedRing).filter(Boolean);
    if (rings.length === 0) {
      skipped += 1;
      continue;
    }

    const enuRings = rings
      .map((ring) =>
        ring.map((position) =>
          enuPointFromPosition(position, frame, surfaceOffsetMeters),
        ),
      )
      .filter((ring) => ring.length >= 3);

    if (enuRings.length === 0) {
      skipped += 1;
      continue;
    }

    const projectedOuter = projectPolygon(enuRings[0]);
    const projectedHoles = enuRings.slice(1).map(projectPolygon);
    const triangles = THREE.ShapeUtils.triangulateShape(
      projectedOuter,
      projectedHoles,
    );

    if (triangles.length === 0) {
      skipped += 1;
      continue;
    }

    const batchId = batches.length;
    const gltfRings = enuRings.map((ring) => ring.map(gltfPointFromEnu));
    const gltfLineRings = enuRings.map((ring) =>
      ring.map((point) =>
        gltfPointFromEnu(
          new THREE.Vector3(point.x, point.y, point.z + TILE_EDGE_OFFSET_METERS),
        ),
      ),
    );
    const points = gltfRings.flat();
    batches.push({
      partId: surface.partId,
      geometryId: surface.geometryId,
      featureId: surface.featureId,
      objectId: surface.objectId,
      className: surface.className,
      lod: surface.lod,
      property: surface.property,
      surfaceType,
    });

    for (const triangle of triangles) {
      pushTriangle(
        vertices,
        normals,
        colors,
        batchIds,
        batchId,
        surfaceColor,
        points[triangle[0]],
        points[triangle[1]],
        points[triangle[2]],
      );
    }

    for (const ring of gltfLineRings) {
      for (let index = 0; index < ring.length; index += 1) {
        pushLineSegment(
          lineVertices,
          lineColors,
          TILE_VERTEX_COLORS.edge,
          ring[index],
          ring[(index + 1) % ring.length],
        );
      }
    }
  }

  if (vertices.length === 0) {
    throw new Error("The selected area returned no renderable polygon surfaces.");
  }

  const edgeBatchId = batches.length;
  batches.push({
    partId: "outline",
    geometryId: 0,
    featureId: 0,
    objectId: "outline",
    className: "Outline",
    lod: NYC_LOD,
    property: "outline",
    surfaceType: "edge",
  });

  return {
    vertices,
    normals,
    colors,
    batchIds,
    lineVertices,
    lineColors,
    lineBatchIds: Array(lineVertices.length / 3).fill(edgeBatchId),
    batches,
    skipped,
    vertexCount: vertices.length / 3,
    lineVertexCount: lineVertices.length / 3,
  };
}

function vectorBounds(values, itemSize) {
  const min = Array.from({ length: itemSize }, () => Infinity);
  const max = Array.from({ length: itemSize }, () => -Infinity);

  for (let index = 0; index < values.length; index += itemSize) {
    for (let axis = 0; axis < itemSize; axis += 1) {
      const value = values[index + axis];
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }

  return { min, max };
}

function floatBuffer(values) {
  const array = new Float32Array(values);
  return Buffer.from(array.buffer);
}

function padBuffer(buffer, alignment, padByte) {
  const padding = (alignment - (buffer.length % alignment)) % alignment;
  return padding === 0
    ? buffer
    : Buffer.concat([buffer, Buffer.alloc(padding, padByte)]);
}

function padBufferForOffset(buffer, offset, alignment, padByte) {
  const padding = (alignment - ((offset + buffer.length) % alignment)) % alignment;
  return padding === 0
    ? buffer
    : Buffer.concat([buffer, Buffer.alloc(padding, padByte)]);
}

function glbFromMesh(mesh) {
  const positionBuffer = floatBuffer(mesh.vertices);
  const normalBuffer = floatBuffer(mesh.normals);
  const colorBuffer = floatBuffer(mesh.colors);
  const batchIdBuffer = floatBuffer(mesh.batchIds);
  const linePositionBuffer = floatBuffer(mesh.lineVertices);
  const lineColorBuffer = floatBuffer(mesh.lineColors);
  const lineBatchIdBuffer = floatBuffer(mesh.lineBatchIds);
  const normalOffset = positionBuffer.length;
  const colorOffset = normalOffset + normalBuffer.length;
  const batchIdOffset = colorOffset + colorBuffer.length;
  const linePositionOffset = batchIdOffset + batchIdBuffer.length;
  const lineColorOffset = linePositionOffset + linePositionBuffer.length;
  const lineBatchIdOffset = lineColorOffset + lineColorBuffer.length;
  const binaryBuffer = Buffer.concat([
    positionBuffer,
    normalBuffer,
    colorBuffer,
    batchIdBuffer,
    linePositionBuffer,
    lineColorBuffer,
    lineBatchIdBuffer,
  ]);
  const positionBounds = vectorBounds(mesh.vertices, 3);
  const linePositionBounds = vectorBounds(mesh.lineVertices, 3);

  const json = {
    asset: {
      version: "2.0",
      generator: "citygml-lod3-viewer dynamic 3D Tiles",
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: {
              POSITION: 0,
              NORMAL: 1,
              COLOR_0: 2,
              _BATCHID: 3,
            },
            material: 0,
            mode: 4,
          },
          {
            attributes: {
              POSITION: 4,
              COLOR_0: 5,
              _BATCHID: 6,
            },
            material: 1,
            mode: 1,
          },
        ],
      },
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: TILE_BASE_COLOR_FACTOR,
          metallicFactor: 0,
          roughnessFactor: 0.85,
        },
        doubleSided: true,
      },
      {
        pbrMetallicRoughness: {
          baseColorFactor: TILE_VERTEX_COLORS.edge,
          metallicFactor: 0,
          roughnessFactor: 1,
        },
        emissiveFactor: TILE_VERTEX_COLORS.edge.slice(0, 3),
      },
    ],
    buffers: [{ byteLength: binaryBuffer.length }],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: positionBuffer.length,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: normalOffset,
        byteLength: normalBuffer.length,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: colorOffset,
        byteLength: colorBuffer.length,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: batchIdOffset,
        byteLength: batchIdBuffer.length,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: linePositionOffset,
        byteLength: linePositionBuffer.length,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: lineColorOffset,
        byteLength: lineColorBuffer.length,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: lineBatchIdOffset,
        byteLength: lineBatchIdBuffer.length,
        target: 34962,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126,
        count: mesh.vertexCount,
        type: "VEC3",
        min: positionBounds.min,
        max: positionBounds.max,
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5126,
        count: mesh.vertexCount,
        type: "VEC3",
      },
      {
        bufferView: 2,
        byteOffset: 0,
        componentType: 5126,
        count: mesh.vertexCount,
        type: "VEC4",
      },
      {
        bufferView: 3,
        byteOffset: 0,
        componentType: 5126,
        count: mesh.vertexCount,
        type: "SCALAR",
      },
      {
        bufferView: 4,
        byteOffset: 0,
        componentType: 5126,
        count: mesh.lineVertexCount,
        type: "VEC3",
        min: linePositionBounds.min,
        max: linePositionBounds.max,
      },
      {
        bufferView: 5,
        byteOffset: 0,
        componentType: 5126,
        count: mesh.lineVertexCount,
        type: "VEC4",
      },
      {
        bufferView: 6,
        byteOffset: 0,
        componentType: 5126,
        count: mesh.lineVertexCount,
        type: "SCALAR",
      },
    ],
  };

  const jsonChunk = padBuffer(Buffer.from(JSON.stringify(json), "utf8"), 4, 0x20);
  const binChunk = padBuffer(binaryBuffer, 4, 0x00);
  const byteLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const header = Buffer.alloc(12);
  header.write("glTF", 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(byteLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);

  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]);
}

function batchTableFromMesh(mesh) {
  const keys = [
    "partId",
    "geometryId",
    "featureId",
    "objectId",
    "className",
    "lod",
    "property",
    "surfaceType",
  ];
  return Object.fromEntries(
    keys.map((key) => [key, mesh.batches.map((batch) => batch[key])]),
  );
}

function b3dmFromMesh(mesh) {
  const featureTableJson = Buffer.from(
    JSON.stringify({ BATCH_LENGTH: mesh.batches.length }),
    "utf8",
  );
  const batchTableJson = Buffer.from(JSON.stringify(batchTableFromMesh(mesh)), "utf8");
  const headerLength = 28;
  const paddedFeatureTableJson = padBufferForOffset(
    featureTableJson,
    headerLength,
    8,
    0x20,
  );
  const paddedBatchTableJson = padBufferForOffset(
    batchTableJson,
    headerLength + paddedFeatureTableJson.length,
    8,
    0x20,
  );
  const glb = glbFromMesh(mesh);
  const byteLength =
    headerLength +
    paddedFeatureTableJson.length +
    paddedBatchTableJson.length +
    glb.length;
  const header = Buffer.alloc(headerLength);
  header.write("b3dm", 0);
  header.writeUInt32LE(1, 4);
  header.writeUInt32LE(byteLength, 8);
  header.writeUInt32LE(paddedFeatureTableJson.length, 12);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(paddedBatchTableJson.length, 20);
  header.writeUInt32LE(0, 24);

  return Buffer.concat([header, paddedFeatureTableJson, paddedBatchTableJson, glb]);
}

function emptyGlb() {
  const json = {
    asset: {
      version: "2.0",
      generator: "citygml-lod3-viewer empty 3D Tiles cell",
    },
    scene: 0,
    scenes: [{ nodes: [] }],
  };
  const jsonChunk = padBuffer(Buffer.from(JSON.stringify(json), "utf8"), 4, 0x20);
  const byteLength = 12 + 8 + jsonChunk.length;
  const header = Buffer.alloc(12);
  header.write("glTF", 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(byteLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);

  return Buffer.concat([header, jsonHeader, jsonChunk]);
}

function emptyB3dm() {
  const featureTableJson = Buffer.from(JSON.stringify({ BATCH_LENGTH: 0 }), "utf8");
  const batchTableJson = Buffer.from("{}", "utf8");
  const headerLength = 28;
  const paddedFeatureTableJson = padBufferForOffset(
    featureTableJson,
    headerLength,
    8,
    0x20,
  );
  const paddedBatchTableJson = padBufferForOffset(
    batchTableJson,
    headerLength + paddedFeatureTableJson.length,
    8,
    0x20,
  );
  const glb = emptyGlb();
  const byteLength =
    headerLength +
    paddedFeatureTableJson.length +
    paddedBatchTableJson.length +
    glb.length;
  const header = Buffer.alloc(headerLength);
  header.write("b3dm", 0);
  header.writeUInt32LE(1, 4);
  header.writeUInt32LE(byteLength, 8);
  header.writeUInt32LE(paddedFeatureTableJson.length, 12);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(paddedBatchTableJson.length, 20);
  header.writeUInt32LE(0, 24);

  return Buffer.concat([header, paddedFeatureTableJson, paddedBatchTableJson, glb]);
}

function citydbApiPlugin() {
  const pool = new Pool(dbConfig);

  return {
    name: "citydb-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = new URL(req.url || "", "http://localhost").pathname;
        if (path === "/3dcitydb") {
          sendHtml(res, "3dcitydb.html");
          return;
        }
        if (path.startsWith("/3dcitydb-client")) {
          proxyWebMapClient(req, res);
          return;
        }
        next();
      });

      server.middlewares.use("/api/citydb", (req, res, next) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        if (req.method === "OPTIONS") {
          sendCorsPreflight(res);
          return;
        }
        next();
      });

      server.middlewares.use("/api/citydb/cities", async (req, res) => {
        if (req.method !== "GET") {
          sendJson(res, 405, { error: "Method not allowed" });
          return;
        }

        try {
          const url = new URL(req.url || "", "http://localhost");
          const parts =
            url.searchParams.get("refresh") === "1"
              ? await refreshNycParts(pool)
              : await getNycParts(pool);
          sendJson(res, 200, buildPartsPayload(parts));
        } catch (error) {
          sendApiError(res, error);
        }
      });

      server.middlewares.use("/api/citydb/surfaces", async (req, res) => {
        if (req.method !== "GET") {
          sendJson(res, 405, { error: "Method not allowed" });
          return;
        }

        const url = new URL(req.url || "", "http://localhost");
        const requestedPartIds = normalizePartIds(url.searchParams.get("parts"));
        const view = spatialWindowFromUrl(url);
        if (requestedPartIds.length === 0) {
          sendJson(res, 400, { error: "No valid New York City parts requested" });
          return;
        }

        try {
          const sqlFilter = sqlFilterFromUrl(url);
          const surfaceData = await getSurfaceData(pool, requestedPartIds, view, {
            sqlFilter,
          });
          sendJson(res, 200, {
            ...basePayload(surfaceData),
            surfaces: surfaceData.surfaces.map(({ geojson, ...surface }) => surface),
          });
        } catch (error) {
          sendApiError(res, error, { includeDatabase: true });
        }
      });

      server.middlewares.use("/api/citydb/streets", async (req, res) => {
        if (req.method !== "GET") {
          sendJson(res, 405, { error: "Method not allowed" });
          return;
        }

        const url = new URL(req.url || "", "http://localhost");
        const view = spatialWindowFromUrl(url);
        if (!view) {
          sendJson(res, 400, {
            error:
              "Street requests require minLon, minLat, maxLon and maxLat, or lon, lat and radius.",
          });
          return;
        }

        const limit = boundedLimit(
          url,
          "limit",
          MAX_STREETS_PER_RESPONSE,
          MAX_STREETS_PER_RESPONSE,
        );
        const cacheKey = `${url.searchParams.toString()}&limit=${limit}`;

        try {
          const cachedResponse = getCachedStreetsJson(cacheKey);
          if (cachedResponse) {
            sendJsonText(res, 200, cachedResponse);
            return;
          }

          const streetData = await getStreetData(pool, view, limit);
          const responseText = JSON.stringify(streetsPayload(streetData));
          setCachedStreetsJson(cacheKey, responseText);
          sendJsonText(res, 200, responseText);
        } catch (error) {
          if (error?.code === "42P01") {
            sendJson(res, 404, {
              error:
                "Street layer table city_layers.nyc_streets was not found. Import the NYS Streets shapefile first.",
            });
            return;
          }
          sendApiError(res, error, { includeDatabase: true });
        }
      });

      server.middlewares.use("/api/citydb/3dtiles/tileset.json", async (req, res) => {
        if (req.method !== "GET") {
          sendJson(res, 405, { error: "Method not allowed" });
          return;
        }

        const url = new URL(req.url || "", "http://localhost");
        const requestedPartIds = normalizePartIds(url.searchParams.get("parts"));
        if (requestedPartIds.length === 0) {
          sendJson(res, 400, { error: "No valid New York City parts requested" });
          return;
        }

        try {
          const sqlFilter = sqlFilterFromUrl(url);
          await validateSqlFilter(pool, sqlFilter, requestedPartIds);
          const parts = await getRequestedImportedParts(pool, requestedPartIds);
          if (parts.length === 0) {
            sendJson(res, 404, { error: "Requested New York City parts are not imported" });
            return;
          }

          sendJson(res, 200, buildTileset(parts, sqlFilter));
        } catch (error) {
          sendApiError(res, error, { includeDatabase: true });
        }
      });

      server.middlewares.use("/api/citydb/3dtiles/tile.b3dm", async (req, res) => {
        if (req.method !== "GET") {
          sendJson(res, 405, { error: "Method not allowed" });
          return;
        }

        const url = new URL(req.url || "", "http://localhost");
        const requestedPartIds = normalizePartIds(url.searchParams.get("parts"));
        const view = spatialWindowFromUrl(url);
        const cacheKey = url.searchParams.toString();
        if (requestedPartIds.length === 0) {
          sendJson(res, 400, { error: "No valid New York City parts requested" });
          return;
        }

        try {
          const sqlFilter = sqlFilterFromUrl(url);
          const cachedResponse = getCachedTile(cacheKey);
          if (cachedResponse) {
            sendBinary(res, 200, cachedResponse, "application/octet-stream");
            return;
          }

          const surfaceData = await getSurfaceData(pool, requestedPartIds, view, {
            includeStats: false,
            outputVerticalScale: NYC_VERTICAL_SCALE,
            sqlFilter,
          });
          if (surfaceData.surfaces.length === 0) {
            if (view) {
              const responseBody = emptyB3dm();
              setCachedTile(cacheKey, responseBody);
              sendBinary(res, 200, responseBody, "application/octet-stream");
            } else {
              sendJson(res, 404, {
                error: "The selected area returned no renderable LoD2 surfaces",
              });
            }
            return;
          }

          const frame = localFrameForParts(surfaceData.parts);
          const mesh = meshFromSurfaces(surfaceData.surfaces, frame);
          const responseBody = b3dmFromMesh(mesh);
          setCachedTile(cacheKey, responseBody);
          sendBinary(res, 200, responseBody, "application/octet-stream");
        } catch (error) {
          sendApiError(res, error, { includeDatabase: true });
        }
      });

      server.middlewares.use("/api/citydb/geojson", async (req, res) => {
        if (req.method !== "GET") {
          sendJson(res, 405, { error: "Method not allowed" });
          return;
        }

        const url = new URL(req.url || "", "http://localhost");
        const requestedPartIds = normalizePartIds(url.searchParams.get("parts"));
        const view = spatialWindowFromUrl(url);
        const cacheKey = url.searchParams.toString();
        if (requestedPartIds.length === 0) {
          sendJson(res, 400, { error: "No valid New York City parts requested" });
          return;
        }

        try {
          const sqlFilter = sqlFilterFromUrl(url);
          const cachedResponse = getCachedJson(cacheKey);
          if (cachedResponse) {
            sendJsonText(res, 200, cachedResponse);
            return;
          }

          const surfaceData = await getSurfaceData(pool, requestedPartIds, view, {
            includeStats: false,
            outputVerticalScale: NYC_VERTICAL_SCALE,
            sqlFilter,
          });
          const responseBody = {
            type: "FeatureCollection",
            name: "New York City LoD2",
            metadata: basePayload(surfaceData),
            features: surfaceData.surfaces.map((surface) => ({
              type: "Feature",
              id: `${surface.partId}-${surface.geometryId}`,
              properties: {
                partId: surface.partId,
                geometryId: surface.geometryId,
                featureId: surface.featureId,
                objectId: surface.objectId,
                className: surface.className,
                lod: surface.lod,
                property: surface.property,
              },
              geometry: surface.geojson,
            })),
          };
          const responseText = JSON.stringify(responseBody);
          setCachedJson(cacheKey, responseText);
          sendJsonText(res, 200, responseText);
        } catch (error) {
          sendApiError(res, error, { includeDatabase: true });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [citydbApiPlugin()],
  server: {
    host: DEV_SERVER_HOST,
  },
});
