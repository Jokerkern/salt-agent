import { Hono } from "hono";
import { SessionManager } from "../../session/index.js";

export function createSessionsRoutes(sessionManager: SessionManager) {
  const app = new Hono();

  app.get("/", async (c) => {
    try {
      const sessions = await sessionManager.listSessions();
      return c.json({ sessions });
    } catch (error) {
      console.error("List sessions error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  app.get("/:id", async (c) => {
    try {
      const sessionId = c.req.param("id");
      const metadata = await sessionManager.getMetadata(sessionId);
      
      if (!metadata) {
        return c.json({ error: "Session not found" }, 404);
      }

      const messages = await sessionManager.getMessages(sessionId);

      return c.json({ metadata, messages });
    } catch (error) {
      console.error("Get session error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  app.delete("/:id", async (c) => {
    try {
      const sessionId = c.req.param("id");
      const deleted = await sessionManager.deleteSession(sessionId);
      
      if (!deleted) {
        return c.json({ error: "Session not found" }, 404);
      }

      return c.json({ success: true });
    } catch (error) {
      console.error("Delete session error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  return app;
}
