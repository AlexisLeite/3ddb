import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite";
import { ResponseCache } from "../cache/ResponseCache.js";
import type { ServerConfig } from "../config/ServerConfig.js";
import type { DataLoader } from "../data/DataLoader.js";
import type { DataTiler } from "../tiling/DataTiler.js";
import { proxyWebMapClient } from "./proxyWebMapClient.js";
import { requestUrl } from "./requestUrl.js";
import { sendApiError } from "./sendApiError.js";
import { sendBinary } from "./sendBinary.js";
import { sendCorsPreflight } from "./sendCorsPreflight.js";
import { sendJson } from "./sendJson.js";
import { spatialWindowFromUrl } from "./spatialWindowFromUrl.js";

/**
 * Registers the HTTP routes used by the Vite development server and delegates
 * data loading, tiling and web map proxying to focused collaborators.
 */
export class Server {
  private readonly tileCache: ResponseCache<Buffer>;

  constructor(
    private readonly config: ServerConfig,
    private readonly dataLoader: DataLoader,
    private readonly dataTiler: DataTiler,
  ) {
    this.tileCache = new ResponseCache<Buffer>(
      config.tiles.responseCacheLimit,
      config.tiles.responseCacheMs,
    );
  }

  vitePlugin(): Plugin {
    return {
      name: "citydb-api",
      configureServer: (server) => {
        this.configureServer(server);
      },
    };
  }

  private configureServer(server: ViteDevServer): void {
    server.middlewares.use((req, res, next) => {
      const path = requestUrl(req).pathname;
      if (path.startsWith("/3dcitydb-client")) {
        void proxyWebMapClient(req, res, this.config.webMapBaseUrl);
        return;
      }
      next();
    });

    server.middlewares.use("/api/citydb", (req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") {
        sendCorsPreflight(res);
        return;
      }
      next();
    });

    server.middlewares.use("/api/citydb/cities", (req, res) => {
      void this.handleCities(req, res);
    });
    server.middlewares.use("/api/citydb/3dtiles/tileset.json", (req, res) => {
      void this.handleTileset(req, res);
    });
    server.middlewares.use("/api/citydb/3dtiles/tile.b3dm", (req, res) => {
      void this.handleTile(req, res);
    });
  }

  private async handleCities(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.requireGet(req, res)) return;

    try {
      const url = requestUrl(req);
      const parts =
        url.searchParams.get("refresh") === "1"
          ? await this.dataLoader.refreshParts()
          : await this.dataLoader.getParts();
      sendJson(res, 200, this.dataLoader.partsPayload(parts));
    } catch (error) {
      sendApiError(res, error);
    }
  }

  private async handleTileset(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.requireGet(req, res)) return;

    const requestedPartIds = this.dataLoader.normalizePartIds(
      requestUrl(req).searchParams.get("parts"),
    );
    if (requestedPartIds.length === 0) {
      sendJson(res, 400, { error: "No valid New York City parts requested" });
      return;
    }

    try {
      const parts = await this.dataLoader.getImportedParts(requestedPartIds);
      if (parts.length === 0) {
        sendJson(res, 404, { error: "Requested New York City parts are not imported" });
        return;
      }
      sendJson(res, 200, this.dataTiler.buildTileset(parts));
    } catch (error) {
      sendApiError(res, error);
    }
  }

  private async handleTile(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.requireGet(req, res)) return;

    const url = requestUrl(req);
    const requestedPartIds = this.dataLoader.normalizePartIds(url.searchParams.get("parts"));
    if (requestedPartIds.length === 0) {
      sendJson(res, 400, { error: "No valid New York City parts requested" });
      return;
    }

    try {
      const cacheKey = url.searchParams.toString();
      const cachedResponse = this.tileCache.get(cacheKey);
      if (cachedResponse) {
        sendBinary(
          res,
          200,
          cachedResponse,
          "application/octet-stream",
          this.config.tileHttpCacheControl,
        );
        return;
      }

      const view = spatialWindowFromUrl(
        url,
        this.config.query.minQueryRadiusMeters,
        this.config.query.maxQueryRadiusMeters,
      );
      const surfaceData = await this.dataLoader.loadSurfaces(requestedPartIds, view);
      const responseBody = this.dataTiler.buildTile(surfaceData);
      this.tileCache.set(cacheKey, responseBody);
      sendBinary(
        res,
        200,
        responseBody,
        "application/octet-stream",
        this.config.tileHttpCacheControl,
      );
    } catch (error) {
      sendApiError(res, error);
    }
  }

  private requireGet(req: IncomingMessage, res: ServerResponse): boolean {
    if (req.method === "GET") return true;
    sendJson(res, 405, { error: "Method not allowed" });
    return false;
  }
}
