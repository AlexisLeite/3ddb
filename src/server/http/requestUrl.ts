import type { IncomingMessage } from "node:http";

/**
 * Builds a URL object from a Node request using localhost as the base for
 * relative middleware request paths.
 */
export function requestUrl(req: IncomingMessage): URL {
  return new URL(req.url || "", "http://localhost");
}
