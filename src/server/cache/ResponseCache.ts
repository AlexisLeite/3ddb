/**
 * Stores short-lived in-memory responses with a fixed entry limit so repeated
 * tile requests can reuse recent binary payloads without unbounded growth.
 */
export class ResponseCache<T> {
  private readonly entries = new Map<string, { body: T; createdAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly ttlMs: number,
  ) {}

  get(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.entries.delete(key);
      return null;
    }
    return entry.body;
  }

  set(key: string, body: T): void {
    this.entries.set(key, { body, createdAt: Date.now() });
    while (this.entries.size > this.limit) {
      const firstKey = this.entries.keys().next().value;
      if (firstKey === undefined) break;
      this.entries.delete(firstKey);
    }
  }
}
