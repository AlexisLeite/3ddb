import { createHash } from "node:crypto";

/**
 * Creates a compact deterministic hash used for cache keys and tileset version
 * identifiers derived from style and tiling configuration values.
 */
export function shortHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 8);
}
