import type { IncomingMessage } from "node:http";

function apiError(message: string, statusCode = 400): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

/**
 * Reads and parses a bounded JSON request body for local API endpoints that
 * accept user-authored payloads through the Vite middleware server.
 */
export function readJsonBody(req: IncomingMessage, maxBytes = 65536): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > maxBytes) {
        reject(apiError("El body JSON es demasiado grande.", 413));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(apiError("El body JSON no es valido."));
      }
    });
    req.on("error", reject);
  });
}
