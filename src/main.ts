import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "./server/app.js";
import { SaltSessionManager } from "./session/index.js";
import { loadSkills } from "./skills/index.js";
import { config } from "./config.js";

async function main() {
  console.log("Starting salt-agent...");

  // Initialize session manager
  const sessionManager = new SaltSessionManager(config.sessionsDir);
  await sessionManager.init();
  console.log(`Sessions directory: ${config.sessionsDir}`);
  console.log(`Agent directory: ${config.agentDir}`);

  // Load skills
  const { skills, warnings } = loadSkills({ skillDirs: config.skillDirs });
  for (const warn of warnings) {
    console.warn(`[skills] ${warn}`);
  }
  if (skills.length > 0) {
    console.log(`Skills loaded: ${skills.map((s) => s.name).join(", ")}`);
  } else {
    console.log("No skills loaded.");
  }

  // Create app
  const app = createApp(sessionManager, skills);

  // Start server
  serve({
    fetch: app.fetch,
    port: config.port,
  });

  console.log(`Server running on http://localhost:${config.port}`);
  console.log(`OpenAI API Key: ${config.openaiApiKey ? "Set" : "Not set"}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
