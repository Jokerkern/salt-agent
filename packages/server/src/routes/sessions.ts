import { Hono } from "hono"
import {
  listSessions,
  getSession,
  deleteSession,
  getMessages,
  createSession,
} from "@salt-agent/core"

export function createSessionsRoutes() {
  const app = new Hono()

  // List all sessions
  app.get("/", (c) => {
    const sessions = listSessions()
    return c.json({ sessions })
  })

  // Create a new session
  app.post("/", async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const session = createSession({
      title: body.title,
      agent: body.agent,
    })
    return c.json(session, 201)
  })

  // Get session details with messages
  app.get("/:id", (c) => {
    const id = c.req.param("id")
    const session = getSession(id)
    if (!session) {
      return c.json({ error: "Session not found" }, 404)
    }
    const messages = getMessages(id)
    return c.json({ ...session, messages })
  })

  // Delete a session
  app.delete("/:id", (c) => {
    const id = c.req.param("id")
    const deleted = deleteSession(id)
    if (!deleted) {
      return c.json({ error: "Session not found" }, 404)
    }
    return c.json({ deleted: true })
  })

  return app
}
