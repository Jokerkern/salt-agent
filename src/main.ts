import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "./server/app.js";
import { SessionManager } from "./session/index.js";
import { config } from "./config.js";

async function main() {
  console.log("Starting salt-agent...");

  // Initialize session manager
  const sessionManager = new SessionManager(config.sessionsDir);
  await sessionManager.init();
  console.log(`Sessions directory: ${config.sessionsDir}`);

  // Create app
  const app = createApp(sessionManager);

  // Start server
  serve({
    fetch: app.fetch,
    port: config.port,
  });

  console.log(`Server running on http://localhost:${config.port}`);
  console.log(`OpenAI API Key: ${config.openaiApiKey ? "✓ Set" : "✗ Not set"}`);
  console.log(`Default Model: ${config.defaultModel}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
