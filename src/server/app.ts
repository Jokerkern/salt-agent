import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "@hono/node-server/serve-static";
import { createIMRoutes } from "./routes/im.js";
import { createChatRoutes } from "./routes/chat.js";
import { createSessionsRoutes } from "./routes/sessions.js";
import { createSettingsRoutes } from "./routes/settings.js";

export function createApp() {
  const app = new Hono();

  app.use("*", logger());
  app.use("*", cors());

  // API routes first (before static files)
  app.get("/api", (c) => {
    return c.json({
      name: "salt-agent",
      version: "0.1.0",
      endpoints: {
        im: "/api/im/message",
        chat: "/api/chat/stream/:sessionId",
        sessions: "/api/sessions",
        settings: "/api/settings",
      },
    });
  });

  app.route("/api/im", createIMRoutes());
  app.route("/api/chat", createChatRoutes());
  app.route("/api/sessions", createSessionsRoutes());
  app.route("/api/settings", createSettingsRoutes());

  // Serve static files from web/dist (must be last)
  app.get("*", serveStatic({ root: "./web/dist" }));
  app.get("*", serveStatic({ path: "./web/dist/index.html" }));

  return app;
}
