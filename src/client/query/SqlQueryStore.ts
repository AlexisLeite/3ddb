import { makeAutoObservable, runInAction } from "mobx";
import type { PointOfInterest } from "../gallery/PointOfInterest.js";
import type { GalleryMapStore } from "../stores/GalleryMapStore.js";
import { bboxWhereSql } from "./bboxWhereSql.js";

type SqlMode = "where" | "select";

interface SqlQueryEntry {
  mode: SqlMode;
  sql: string;
  queryId: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  totalRowCount: number;
  truncated: boolean;
  bboxMeters: number;
  isLoading: boolean;
  isTableVisible: boolean;
  error: string;
}

interface SqlQueryResponse {
  queryId: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  totalRowCount: number;
  truncated: boolean;
}

interface SqlQueryPayload {
  mode: SqlMode;
  sql: string;
}

const defaultEntry: SqlQueryEntry = {
  mode: "where",
  sql: "",
  queryId: "",
  columns: [],
  rows: [],
  rowCount: 0,
  totalRowCount: 0,
  truncated: false,
  bboxMeters: 200,
  isLoading: false,
  isTableVisible: false,
  error: "",
};

/**
 * Owns SQL query UI state per tour point and coordinates successful query
 * results with the map store so each stop can restore its own rendered filter.
 */
export class SqlQueryStore {
  private readonly entries = new Map<string, SqlQueryEntry>();

  constructor(private readonly mapStore: GalleryMapStore) {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  /**
   * Returns the current query state for one tour point without creating state
   * during React rendering when the user has not edited that stop yet.
   */
  stateFor(pointId: string): SqlQueryEntry {
    return this.entries.get(pointId) || { ...defaultEntry };
  }

  /**
   * Updates the query mode for a tour point and clears stale errors from the
   * previous attempt while preserving the typed SQL text.
   */
  setMode(pointId: string, mode: SqlMode): void {
    this.updateEntry(pointId, { mode, error: "" });
  }

  /**
   * Updates the SQL text for a tour point and clears stale render identifiers
   * because the saved result no longer matches what the user typed.
   */
  setSql(pointId: string, sql: string): void {
    this.updateEntry(pointId, {
      sql,
      queryId: "",
      columns: [],
      rows: [],
      rowCount: 0,
      totalRowCount: 0,
      truncated: false,
      isTableVisible: false,
      error: "",
    });
  }

  /**
   * Updates the square bounding-box radius used to generate a spatial SQL
   * condition around the active tour point.
   */
  setBboxMeters(pointId: string, meters: number): void {
    this.updateEntry(pointId, {
      bboxMeters: Math.max(25, Math.min(2000, Math.round(meters || 200))),
    });
  }

  /**
   * Generates and executes a renderable SQL WHERE condition that intersects the
   * selected point's bounding box with 3DCityDB geometry.
   */
  async executeBoundingBox(point: PointOfInterest): Promise<void> {
    const entry = this.ensureEntry(point.id);
    const sql = bboxWhereSql(point.latitude, point.longitude, entry.bboxMeters);
    this.updateEntry(point.id, {
      mode: "where",
      sql,
      queryId: "",
      columns: [],
      rows: [],
      rowCount: 0,
      totalRowCount: 0,
      truncated: false,
      isTableVisible: false,
      error: "",
    });
    await this.executeQuery(point.id, { mode: "where", sql });
  }

  /**
   * Reveals the preview table for the latest successful query saved for one
   * tour point, keeping table rendering separate from applying map filters.
   */
  showResults(pointId: string): void {
    const entry = this.ensureEntry(pointId);
    this.updateEntry(pointId, {
      isTableVisible: entry.queryId !== "" && entry.columns.length > 0,
    });
  }

  /**
   * Executes the active query for a tour point, stores the preview table and
   * applies the returned render query identifier to the map.
   */
  async execute(pointId: string): Promise<void> {
    const entry = this.ensureEntry(pointId);
    await this.executeQuery(pointId, { mode: entry.mode, sql: entry.sql });
  }

  private async executeQuery(pointId: string, query: SqlQueryPayload): Promise<void> {
    this.updateEntry(pointId, { isLoading: true, isTableVisible: false, error: "" });
    try {
      const response = await fetch("/api/citydb/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: query.mode,
          sql: query.sql,
          tourPointId: pointId,
          limit: 200,
        }),
      });
      const body = await response.json() as Partial<SqlQueryResponse> & { error?: string };
      if (!response.ok) throw new Error(body.error || "No se pudo ejecutar la consulta.");
      const queryId = body.queryId || "";
      runInAction(() => {
        this.updateEntry(pointId, {
          queryId,
          columns: body.columns || [],
          rows: body.rows || [],
          rowCount: body.rowCount || 0,
          totalRowCount: body.totalRowCount ?? body.rowCount ?? 0,
          truncated: Boolean(body.truncated),
          isLoading: false,
        });
      });
      await this.mapStore.applySqlQuery(queryId || null);
    } catch (error) {
      runInAction(() => {
        this.updateEntry(pointId, {
          isLoading: false,
          error: error instanceof Error ? error.message : "No se pudo ejecutar la consulta.",
        });
      });
    }
  }

  /**
   * Clears the query saved for one tour point and restores the unfiltered map
   * when the cleared point is currently active.
   */
  async clear(pointId: string): Promise<void> {
    this.entries.delete(pointId);
    await this.mapStore.applySqlQuery(null);
  }

  /**
   * Applies the saved render query for a tour point, or clears the active map
   * filter when the stop has no successful query yet.
   */
  async applyForPoint(pointId: string): Promise<void> {
    const queryId = this.entries.get(pointId)?.queryId || null;
    await this.mapStore.applySqlQuery(queryId);
  }

  /**
   * Clears only the active visual map filter while preserving saved per-stop
   * query results that may be restored when the user revisits a point.
   */
  async clearMapFilter(): Promise<void> {
    await this.mapStore.applySqlQuery(null);
  }

  /**
   * Drops all per-point query state and restores the map to the unfiltered
   * dataset, giving a new tour a clean SQL console state.
   */
  reset(): void {
    this.entries.clear();
    void this.mapStore.applySqlQuery(null);
  }

  private ensureEntry(pointId: string): SqlQueryEntry {
    const existing = this.entries.get(pointId);
    if (existing) return existing;
    const entry = { ...defaultEntry };
    this.entries.set(pointId, entry);
    return entry;
  }

  private updateEntry(pointId: string, changes: Partial<SqlQueryEntry>): SqlQueryEntry {
    const entry = { ...this.ensureEntry(pointId), ...changes };
    this.entries.set(pointId, entry);
    return entry;
  }
}
