import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "@hono/node-server/serve-static";
import { SaltSessionManager } from "../session/index.js";
import type { Skill } from "../skills/index.js";
import { createIMRoutes } from "./routes/im.js";
import { createChatRoutes } from "./routes/chat.js";
import { createSessionsRoutes } from "./routes/sessions.js";

export function createApp(sessionManager: SaltSessionManager, skills: Skill[] = []) {
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
      },
    });
  });

  app.route("/api/im", createIMRoutes(sessionManager, skills));
  app.route("/api/chat", createChatRoutes(sessionManager, skills));
  app.route("/api/sessions", createSessionsRoutes(sessionManager));

  // Serve static files from web/dist (must be last)
  app.get("*", serveStatic({ root: "./web/dist" }));
  app.get("*", serveStatic({ path: "./web/dist/index.html" }));

  return app;
}
