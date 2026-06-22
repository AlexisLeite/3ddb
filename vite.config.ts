import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { loadServerConfig } from "./src/server/config/loadServerConfig.js";
import { DataLoader } from "./src/server/data/DataLoader.js";
import { DBManager } from "./src/server/db/DBManager.js";
import { Server } from "./src/server/http/Server.js";
import { SqlQueryRegistry } from "./src/server/sql/SqlQueryRegistry.js";
import { SqlQueryService } from "./src/server/sql/SqlQueryService.js";
import { DataTiler } from "./src/server/tiling/DataTiler.js";

const rootDir = dirname(fileURLToPath(import.meta.url));
const mode = process.env.NODE_ENV || "development";
Object.assign(process.env, loadEnv(mode, rootDir, ""));

const config = loadServerConfig(rootDir);
const dbManager = new DBManager(config.db);
const dataLoader = new DataLoader(dbManager, config);
const dataTiler = new DataTiler(config);
const sqlQueryRegistry = new SqlQueryRegistry(
  config.sql.registryLimit,
  config.sql.registryTtlMs,
);
const sqlQueryService = new SqlQueryService(dbManager, config, sqlQueryRegistry);
const server = new Server(config, dataLoader, dataTiler, sqlQueryService);

export default defineConfig({
  plugins: [server.vitePlugin()],
  server: {
    host: config.devServerHost,
  },
});
