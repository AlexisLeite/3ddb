import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson } from "./sendJson.js";

/**
 * Proxies the hosted 3DCityDB Web Map Client assets through the local Vite
 * server so client code can load the external viewer from the same origin.
 */
export async function proxyWebMapClient(
  req: IncomingMessage,
  res: ServerResponse,
  webMapBaseUrl: string,
): Promise<void> {
  const url = new URL(req.url || "", "http://localhost");
  const clientPath = url.pathname.replace(/^\/3dcitydb-client\/?/, "");
  const remoteUrl = new URL(clientPath || "3dwebclient/index.html", webMapBaseUrl);
  remoteUrl.search = url.search;

  try {
    const response = await fetch(remoteUrl);
    if (!response.ok) {
      res.statusCode = response.status;
      res.end(await response.text());
      return;
    }

    res.statusCode = response.status;
    const contentType = response.headers.get("content-type");
    if (contentType) res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(res, 502, {
      error: `Could not proxy 3DCityDB Web Map Client: ${message}`,
    });
  }
}
