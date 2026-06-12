import type { ServerResponse } from "node:http";

/**
 * Sends a binary HTTP response with CORS and cache headers for generated 3D
 * Tiles payloads and cached tile bodies.
 */
export function sendBinary(
  res: ServerResponse,
  statusCode: number,
  body: Buffer,
  contentType: string,
  cacheControl: string,
): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", cacheControl);
  res.end(body);
}
