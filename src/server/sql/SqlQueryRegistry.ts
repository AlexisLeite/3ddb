import { randomUUID } from "node:crypto";
import type { SqlRenderFilter } from "./SqlRenderFilter.js";

interface RegistryEntry {
  filter: SqlRenderFilter;
  lastUsedAt: number;
}

/**
 * Stores validated SQL render filters behind short-lived identifiers so tile
 * URLs can remain stable and avoid carrying raw user SQL through Cesium.
 */
export class SqlQueryRegistry {
  private readonly entries = new Map<string, RegistryEntry>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
  ) {}

  /**
   * Registers a render filter and returns the query identifier that downstream
   * tileset and tile requests can use until the entry expires.
   */
  register(filter: SqlRenderFilter): string {
    this.pruneExpired();
    const queryId = randomUUID();
    this.entries.set(queryId, {
      filter,
      lastUsedAt: Date.now(),
    });
    this.pruneOverflow();
    return queryId;
  }

  /**
   * Resolves a query identifier into its render filter, refreshing its usage
   * timestamp when it is still valid and removing it when expired.
   */
  resolve(queryId: string | null): SqlRenderFilter | null {
    if (!queryId) return null;
    this.pruneExpired();
    const entry = this.entries.get(queryId);
    if (!entry) return null;
    entry.lastUsedAt = Date.now();
    return entry.filter;
  }

  private pruneExpired(): void {
    const expiresBefore = Date.now() - this.ttlMs;
    for (const [queryId, entry] of this.entries) {
      if (entry.lastUsedAt < expiresBefore) this.entries.delete(queryId);
    }
  }

  private pruneOverflow(): void {
    while (this.entries.size > this.maxEntries) {
      const firstKey = this.entries.keys().next().value;
      if (!firstKey) return;
      this.entries.delete(firstKey);
    }
  }
}
