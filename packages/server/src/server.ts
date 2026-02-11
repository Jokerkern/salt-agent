import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { createSessionsRoutes } from "./routes/sessions.js"
import { createChatRoutes } from "./routes/chat.js"
import { createIMRoutes } from "./routes/im.js"
import { createProvidersRoutes } from "./routes/providers.js"
import { createSettingsRoutes } from "./routes/settings.js"

export function createApp() {
  const app = new Hono()

  app.use("*", logger())
  app.use("*", cors())

  // API info
  app.get("/api", (c) => {
    return c.json({
      name: "salt-agent",
      version: "0.1.0",
      endpoints: {
        chat: "/api/chat/stream/:sessionId",
        im: "/api/im/message",
        sessions: "/api/sessions",
        providers: "/api/providers",
        settings: "/api/settings",
      },
    })
  })

  // Mount routes
  app.route("/api/chat", createChatRoutes())
  app.route("/api/im", createIMRoutes())
  app.route("/api/sessions", createSessionsRoutes())
  app.route("/api/providers", createProvidersRoutes())
  app.route("/api/settings", createSettingsRoutes())

  return app
}
