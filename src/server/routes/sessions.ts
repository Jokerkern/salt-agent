import fs from "fs/promises";
import path from "path";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { getSessionsDir } from "../../config.js";

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

function sessionsDir(): string {
  return getSessionsDir();
}

export function getSessionFile(sessionId: string): string {
  return path.join(sessionsDir(), `${sessionId}.jsonl`);
}

export async function sessionExists(sessionId: string): Promise<boolean> {
  try {
    await fs.access(getSessionFile(sessionId));
    return true;
  } catch {
    return false;
  }
}

export async function createSession(): Promise<string> {
  const id = nanoid();
  await fs.mkdir(sessionsDir(), { recursive: true });
  await fs.writeFile(getSessionFile(id), "", "utf-8");
  return id;
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  try {
    await fs.unlink(getSessionFile(sessionId));
    return true;
  } catch (error) {
    if ((error as any).code === "ENOENT") return false;
    throw error;
  }
}

function getMessages(sessionId: string): AgentMessage[] {
  const file = getSessionFile(sessionId);
  try {
    const sm = SessionManager.open(file);
    const ctx = sm.buildSessionContext();
    return ctx.messages;
  } catch {
    return [];
  }
}

function extractTitle(messages: AgentMessage[]): string {
  for (const msg of messages) {
    if (msg.role !== "user") continue;
    if ("content" in msg) {
      if (Array.isArray(msg.content)) {
        const textPart = msg.content.find((c: any) => c.type === "text");
        if (textPart && "text" in textPart) {
          return (textPart as any).text.slice(0, 50).trim() || "新会话";
        }
      } else if (typeof msg.content === "string") {
        return msg.content.slice(0, 50).trim() || "新会话";
      }
    }
  }
  return "新会话";
}

interface SessionSummary {
  id: string;
  title: string;
  updatedAt: number;
}

async function listSessions(): Promise<SessionSummary[]> {
  try {
    const dir = sessionsDir();
    const files = await fs.readdir(dir);
    const sessions: SessionSummary[] = [];

    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;
      const id = file.replace(".jsonl", "");
      const filePath = path.join(dir, file);
      const stat = await fs.stat(filePath);
      const messages = getMessages(id);
      sessions.push({
        id,
        title: extractTitle(messages),
        updatedAt: stat.mtimeMs,
      });
    }

    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function createSessionsRoutes() {
  const app = new Hono();

  app.get("/", async (c) => {
    try {
      const sessions = await listSessions();
      return c.json({ sessions });
    } catch (error) {
      console.error("List sessions error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  app.get("/:id", async (c) => {
    try {
      const sessionId = c.req.param("id");
      if (!(await sessionExists(sessionId))) {
        return c.json({ error: "Session not found" }, 404);
      }

      const messages = getMessages(sessionId);
      const title = extractTitle(messages);

      return c.json({ metadata: { id: sessionId, title }, messages });
    } catch (error) {
      console.error("Get session error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  app.delete("/:id", async (c) => {
    try {
      const sessionId = c.req.param("id");
      const deleted = await deleteSession(sessionId);

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
