import type { ServerResponse } from "node:http";

/**
 * Sends the shared CORS preflight response used by local API routes exposed
 * through the Vite development server.
 */
export function sendCorsPreflight(res: ServerResponse): void {
  res.statusCode = 204;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end();
}
