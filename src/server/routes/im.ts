import { Hono } from "hono";
import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import { sessionExists, createSession, getSessionFile } from "./sessions.js";
import { loadSettings } from "./settings.js";
import { createSaltSession } from "../../agent.js";

// ---------------------------------------------------------------------------
// IM types
// ---------------------------------------------------------------------------

interface IMMessage {
  session_id?: string;
  user_id: string;
  message: string;
  callback_url: string;
  metadata?: Record<string, any>;
}

interface IMResponse {
  session_id: string;
  response_text: string;
  status: "success" | "error";
  error?: string;
}

// ---------------------------------------------------------------------------
// Callback helper
// ---------------------------------------------------------------------------

async function sendCallback(callbackUrl: string, response: IMResponse): Promise<void> {
  try {
    const res = await fetch(callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
  } catch (error) {
    console.error("Failed to send callback:", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function createIMRoutes() {
  const app = new Hono();

  app.post("/message", async (c) => {
    try {
      const body: IMMessage = await c.req.json();

      if (!body.user_id || !body.message || !body.callback_url) {
        return c.json({ error: "Missing required fields: user_id, message, callback_url" }, 400);
      }

      let sessionId = body.session_id;
      if (!sessionId || !(await sessionExists(sessionId))) {
        sessionId = await createSession();
      }

      const capturedSessionId = sessionId;
      (async () => {
        const settings = await loadSettings();
        if (!settings.baseUrl || !settings.apiKey || !settings.model) {
          await sendCallback(body.callback_url, {
            session_id: capturedSessionId,
            response_text: "API settings not configured",
            status: "error",
            error: "Please configure Base URL, API Key, and Model in settings",
          });
          return;
        }

        const { session } = await createSaltSession(settings, getSessionFile(capturedSessionId));

        let assistantText = "";
        const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
          if (event.type === "message_end" && event.message.role === "assistant") {
            const textContent = (event.message as any).content?.filter?.((c: any) => c.type === "text");
            if (textContent) {
              assistantText = textContent.map((c: any) => c.text).join("\n");
            }
          }
        });

        let error: string | undefined;
        try {
          await session.prompt(body.message);
        } catch (err: any) {
          error = err?.message || String(err);
        } finally {
          unsubscribe();
          session.dispose();
        }

        const response: IMResponse = {
          session_id: capturedSessionId,
          response_text: assistantText || "No response",
          status: error ? "error" : "success",
          error,
        };
        await sendCallback(body.callback_url, response).catch(() => {});
      })();

      return c.json({ session_id: sessionId, status: "accepted" }, 202);
    } catch (error) {
      console.error("IM webhook error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  return app;
}
