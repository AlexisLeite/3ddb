import type { ServerResponse } from "node:http";

/**
 * Sends a JSON HTTP response with the common API CORS headers expected by the
 * browser-side Cesium client code.
 */
export function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
}
