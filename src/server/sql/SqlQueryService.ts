import type { ServerConfig } from "../config/ServerConfig.js";
import type { DBManager } from "../db/DBManager.js";
import type { SqlRenderFilter } from "./SqlRenderFilter.js";
import { SqlQueryRegistry } from "./SqlQueryRegistry.js";
import { SqlQueryValidator } from "./SqlQueryValidator.js";
import { sqlQueryStatements } from "./sqlQueryStatements.js";

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
  totalRowCount: number;
  truncated: boolean;
}

interface SqlCountRow {
  total_row_count: number | string;
}

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
    const { result, totalRowCount } = await this.db.withReadOnlyTransaction(
      this.config.sql.timeoutMs,
      async (client) => {
        const previewResult = await client.query<Record<string, unknown>>(
          sqlQueryStatements.wherePreviewSql(sql),
          [
            this.config.nyc.lod,
            this.config.nyc.verticalScale,
            queryLimit,
          ],
        );
        const countResult = await client.query<SqlCountRow>(sqlQueryStatements.whereCountSql(sql), [
          this.config.nyc.lod,
          this.config.nyc.verticalScale,
        ]);
        return {
          result: previewResult,
          totalRowCount: this.rowCountFromResult(countResult.rows[0]),
        };
      },
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
      columns: sqlQueryStatements.wherePreviewColumns,
      rows,
      rowCount: rows.length,
      totalRowCount,
      truncated: totalRowCount > rows.length,
    };
  }

  private async executeSelect(request: SqlQueryRequest): Promise<SqlQueryResponse> {
    const sql = this.validator.validateSelect(request.sql);
    const queryLimit = Math.max(request.limit, this.config.sql.maxRenderIds) + 1;
    const { result, totalRowCount } = await this.db.withReadOnlyTransaction(
      this.config.sql.timeoutMs,
      async (client) => {
        const previewResult = await client.query<Record<string, unknown>>(
          sqlQueryStatements.selectPreviewSql(sql, queryLimit),
        );
        const countResult = await client.query<SqlCountRow>(sqlQueryStatements.selectCountSql(sql));
        return {
          result: previewResult,
          totalRowCount: this.rowCountFromResult(countResult.rows[0]),
        };
      },
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
      totalRowCount,
      truncated: totalRowCount > rows.length,
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

  private rowCountFromResult(row: SqlCountRow | undefined): number {
    const value = row?.total_row_count;
    const count = typeof value === "number" ? value : Number(value || 0);
    return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  }

}
