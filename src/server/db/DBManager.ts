import pg from "pg";
import type { ServerConfig } from "../config/ServerConfig.js";

const { Pool } = pg;

/**
 * Owns the PostgreSQL connection pool used by data services and exposes the
 * minimal query and shutdown operations needed by the server.
 */
export class DBManager {
  private readonly pool: pg.Pool;

  constructor(config: ServerConfig["db"]) {
    this.pool = new Pool(config);
  }

  /**
   * Executes a typed PostgreSQL query through the managed pool so callers do
   * not need direct access to connection lifecycle details.
   */
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<T>> {
    return this.pool.query<T>(text, values);
  }

  /**
   * Closes the managed PostgreSQL pool, allowing shutdown flows to release
   * database connections cleanly when the server is disposed.
   */
  close(): Promise<void> {
    return this.pool.end();
  }
}
