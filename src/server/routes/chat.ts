import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import { sessionExists, createSession, getSessionFile } from "./sessions.js";
import { loadSettings } from "./settings.js";
import { createSaltSession } from "../../agent.js";

export function createChatRoutes() {
  const app = new Hono();

  app.post("/send", async (c) => {
    try {
      const body = await c.req.json();
      const { message, session_id } = body;

      if (!message) {
        return c.json({ error: "Missing required field: message" }, 400);
      }

      let sessionId = session_id;
      if (!sessionId || !(await sessionExists(sessionId))) {
        sessionId = await createSession();
      }

      return c.json({ session_id: sessionId });
    } catch (error) {
      console.error("Chat send error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  app.get("/stream/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    const message = c.req.query("message");

    if (!message) {
      return c.json({ error: "Missing query parameter: message" }, 400);
    }

    if (!(await sessionExists(sessionId))) {
      return c.json({ error: "Session not found" }, 404);
    }

    const settings = await loadSettings();
    if (!settings.baseUrl || !settings.apiKey || !settings.model) {
      return c.json({ error: "Please configure API settings first (Base URL, API Key, Model)" }, 400);
    }

    return streamSSE(c, async (stream) => {
      const { session } = await createSaltSession(settings, getSessionFile(sessionId));

      const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
        void stream.writeSSE({
          data: JSON.stringify(event),
          event: event.type,
        });
      });

      try {
        await session.prompt(message);
        await stream.writeSSE({
          data: JSON.stringify({ type: "done" }),
          event: "done",
        });
      } catch (error) {
        await stream.writeSSE({
          data: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
          event: "error",
        });
      } finally {
        unsubscribe();
        session.dispose();
      }
    });
  });

  return app;
}
