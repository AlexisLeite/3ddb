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
   * Runs a database operation inside a read-only transaction with a local
   * statement timeout so user-authored SQL cannot mutate or hang the server.
   */
  async withReadOnlyTransaction<T>(
    timeoutMs: number,
    operation: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin read only");
      await client.query("select set_config('statement_timeout', $1, true)", [
        `${timeoutMs}ms`,
      ]);
      const result = await operation(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Closes the managed PostgreSQL pool, allowing shutdown flows to release
   * database connections cleanly when the server is disposed.
   */
  close(): Promise<void> {
    return this.pool.end();
  }
}
