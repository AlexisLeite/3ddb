import type { ServerConfig } from "../config/ServerConfig.js";
import type { DBManager } from "../db/DBManager.js";
import type { SqlRenderFilter } from "./SqlRenderFilter.js";
import { SqlQueryRegistry } from "./SqlQueryRegistry.js";
import { SqlQueryValidator } from "./SqlQueryValidator.js";

type SqlMode = "where" | "select";

interface SqlQueryRequest {
  mode: SqlMode;
  sql: string;
  tourPointId: string;
  limit: number;
}

interface SqlQueryResponse {
  queryId: string;
  mode: SqlMode;
  tourPointId: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

const wherePreviewColumns = [
  "feature_id",
  "geometry_id",
  "objectid",
  "lineage",
  "classname",
  "property_name",
  "lod",
  "height_m",
  "area_m2",
  "height_rank",
  "area_rank",
];

function apiError(message: string, statusCode = 400): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

/**
 * Executes validated read-only SQL requests and registers the resulting feature
 * or geometry identifiers that can be rendered by the dynamic tile pipeline.
 */
export class SqlQueryService {
  private readonly validator: SqlQueryValidator;

  constructor(
    private readonly db: DBManager,
    private readonly config: ServerConfig,
    private readonly registry: SqlQueryRegistry,
  ) {
    this.validator = new SqlQueryValidator(config.sql.maxLength);
  }

  /**
   * Parses, validates and executes one SQL console request, returning preview
   * rows plus a short-lived query identifier for map rendering.
   */
  async execute(payload: unknown): Promise<SqlQueryResponse> {
    const request = this.parseRequest(payload);
    return request.mode === "where"
      ? this.executeWhere(request)
      : this.executeSelect(request);
  }

  /**
   * Resolves a query identifier into the render filter that tile requests use
   * to constrain loaded surfaces, or null when no valid query exists.
   */
  renderFilter(queryId: string | null): SqlRenderFilter | null {
    return this.registry.resolve(queryId);
  }

  private parseRequest(payload: unknown): SqlQueryRequest {
    const body = payload as Partial<SqlQueryRequest> | null;
    if (!body || typeof body !== "object") throw apiError("El body JSON es obligatorio.");
    const mode = body.mode === "select" ? "select" : body.mode === "where" ? "where" : null;
    if (!mode) throw apiError("El modo debe ser where o select.");
    const tourPointId = typeof body.tourPointId === "string" ? body.tourPointId.trim() : "";
    if (!tourPointId) throw apiError("tourPointId es obligatorio.");
    const requestedLimit = Number(body.limit || this.config.sql.maxRows);
    const limit = Math.max(1, Math.min(this.config.sql.maxRows, Math.floor(requestedLimit)));
    return {
      mode,
      sql: String(body.sql ?? ""),
      tourPointId,
      limit,
    };
  }

  private async executeWhere(request: SqlQueryRequest): Promise<SqlQueryResponse> {
    const sql = this.validator.validateWhere(request.sql);
    const queryLimit = Math.max(request.limit, this.config.sql.maxRenderIds) + 1;
    const result = await this.db.withReadOnlyTransaction(this.config.sql.timeoutMs, (client) =>
      client.query<Record<string, unknown>>(this.wherePreviewSql(sql), [
        [this.config.nyc.defaultPartId],
        this.config.nyc.lod,
        this.config.nyc.verticalScale,
        queryLimit,
      ]),
    );
    const rows = result.rows.slice(0, request.limit);
    const featureIds = this.collectIds(result.rows.slice(0, this.config.sql.maxRenderIds), "feature_id");
    const queryId = this.registry.register({
      kind: "featureIds",
      ids: featureIds,
    });
    return {
      queryId,
      mode: request.mode,
      tourPointId: request.tourPointId,
      columns: wherePreviewColumns,
      rows,
      rowCount: rows.length,
      truncated: result.rows.length > request.limit,
    };
  }

  private async executeSelect(request: SqlQueryRequest): Promise<SqlQueryResponse> {
    const sql = this.validator.validateSelect(request.sql);
    const queryLimit = Math.max(request.limit, this.config.sql.maxRenderIds) + 1;
    const result = await this.db.withReadOnlyTransaction(this.config.sql.timeoutMs, (client) =>
      client.query<Record<string, unknown>>(this.selectPreviewSql(sql, queryLimit)),
    );
    const columns = result.fields.map((field) => field.name);
    const idColumn = this.renderColumn(columns);
    const rowsForRender = result.rows.slice(0, this.config.sql.maxRenderIds);
    const ids = this.collectIds(rowsForRender, idColumn.name);
    const queryId = this.registry.register({
      kind: idColumn.kind,
      ids,
    });
    const rows = result.rows.slice(0, request.limit);
    return {
      queryId,
      mode: request.mode,
      tourPointId: request.tourPointId,
      columns,
      rows,
      rowCount: rows.length,
      truncated: result.rows.length > request.limit,
    };
  }

  private renderColumn(columns: string[]): { name: string; kind: SqlRenderFilter["kind"] } {
    const geometryColumn = columns.find((column) => column.toLowerCase() === "geometry_id");
    if (geometryColumn) return { name: geometryColumn, kind: "geometryIds" };
    const featureColumn = columns.find((column) => column.toLowerCase() === "feature_id");
    if (featureColumn) return { name: featureColumn, kind: "featureIds" };
    throw apiError("El SELECT debe devolver feature_id o geometry_id para renderizar.");
  }

  private collectIds(rows: Record<string, unknown>[], column: string): string[] {
    const ids = new Set<string>();
    for (const row of rows) {
      const value = row[column];
      if (typeof value === "number" && Number.isFinite(value)) {
        ids.add(Math.trunc(value).toString());
      }
      if (typeof value === "string" && /^\d+$/.test(value)) {
        ids.add(value);
      }
    }
    return [...ids];
  }

  private selectPreviewSql(sql: string, limit: number): string {
    return `select * from (${sql}) as user_query limit ${limit}`;
  }

  private wherePreviewSql(whereSql: string): string {
    return `
      with building_metric_base as (
        select
          coalesce(f.lineage, 'NYC_DA1') as lineage,
          f.id as feature_id,
          greatest(
            0,
            (coalesce(ST_ZMax(Box3D(f.envelope)), 0) - coalesce(ST_ZMin(Box3D(f.envelope)), 0)) * $3
          )::float8 as height_m,
          (ST_Area(ST_Envelope(f.envelope)) * $3 * $3)::float8 as area_m2
        from citydb.feature f
        where coalesce(f.lineage, 'NYC_DA1') = any($1::text[])
          and f.envelope is not null
      ),
      bm as (
        select
          feature_id,
          height_m,
          area_m2,
          dense_rank() over (partition by lineage order by height_m desc nulls last)::int as height_rank,
          dense_rank() over (partition by lineage order by area_m2 desc nulls last)::int as area_rank
        from building_metric_base
      )
      select distinct on (f.id)
        f.id::text as feature_id,
        gd.id::text as geometry_id,
        f.objectid,
        coalesce(f.lineage, 'NYC_DA1') as lineage,
        oc.classname,
        p.name as property_name,
        p.val_lod as lod,
        round(bm.height_m::numeric, 2)::float8 as height_m,
        round(bm.area_m2::numeric, 2)::float8 as area_m2,
        bm.height_rank,
        bm.area_rank
      from citydb.property p
      join citydb.geometry_data gd on gd.id = p.val_geometry_id
      join citydb.feature f on f.id = p.feature_id
      join citydb.objectclass oc on oc.id = f.objectclass_id
      left join bm on bm.feature_id = f.id
      where coalesce(f.lineage, 'NYC_DA1') = any($1::text[])
        and p.val_lod = $2
        and gd.geometry is not null
        and (${whereSql})
      order by f.id, gd.id
      limit $4;
    `;
  }
}
