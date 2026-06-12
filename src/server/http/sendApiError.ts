import type { ServerResponse } from "node:http";
import { sendJson } from "./sendJson.js";

/**
 * Sends a normalized JSON API error response while preserving explicit status
 * codes from known application errors.
 */
export function sendApiError(res: ServerResponse, error: unknown): void {
  const candidate = error as { message?: string; statusCode?: number };
  sendJson(res, Number(candidate.statusCode) || 500, {
    error: candidate.message || "Unexpected server error",
  });
}
