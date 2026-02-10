import "dotenv/config";
import fs from "fs/promises";
import { serve } from "@hono/node-server";
import { getDataDir, getSessionsDir, getWorkplaceDir } from "./config.js";
import { createApp } from "./server/app.js";

async function main() {
  console.log("Starting salt-agent...");

  const dataDir = getDataDir();
  const sessionsDir = getSessionsDir();
  const workplaceDir = getWorkplaceDir();

  await fs.mkdir(sessionsDir, { recursive: true });
  await fs.mkdir(workplaceDir, { recursive: true });
  console.log(`Data directory: ${dataDir}`);
  console.log(`Sessions directory: ${sessionsDir}`);
  console.log(`Workplace directory: ${workplaceDir}`);

  const app = createApp();

  serve({ fetch: app.fetch, port: 9426 });

  console.log("Server running on http://localhost:9426");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
