import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { SaltSessionManager } from "../../session/index.js";
import { type Skill, formatSkillsForPrompt } from "../../skills/index.js";
import { runAgent } from "../../runner/index.js";
import { config } from "../../config.js";

const SYSTEM_PROMPT_BASE = "你是一个专业的编程助手。你可以读取文件、编写代码、执行命令，帮助用户完成各种编程任务。";

export function createChatRoutes(sessionManager: SaltSessionManager, skills: Skill[] = []) {
  const app = new Hono();

  app.post("/send", async (c) => {
    try {
      const body = await c.req.json();
      const { message, session_id } = body;

      if (!message) {
        return c.json({ error: "Missing required field: message" }, 400);
      }

      let sessionId = session_id;
      if (!sessionId || !(await sessionManager.sessionExists(sessionId))) {
        sessionId = await sessionManager.createSession("web", undefined, message);
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

    if (!(await sessionManager.sessionExists(sessionId))) {
      return c.json({ error: "Session not found" }, 404);
    }

    return streamSSE(c, async (stream) => {
      try {
        const skillsPrompt = formatSkillsForPrompt(skills);
        const systemPrompt = SYSTEM_PROMPT_BASE + skillsPrompt;

        await runAgent({
          sessionId,
          sessionFile: sessionManager.getSessionFile(sessionId),
          prompt: message,
          systemPrompt,
          apiKey: config.openaiApiKey,
          baseUrl: config.openaiBaseUrl,
          modelId: "",  // will be resolved from SettingsManager
          agentDir: config.agentDir,
          cwd: process.cwd(),
          onAgentEvent: async (event) => {
            await stream.writeSSE({
              data: JSON.stringify(event),
              event: event.type,
            });
          },
          onUserMessage: async (msg) => {
            await sessionManager.updateTitleIfNeeded(sessionId, msg);
          },
        });

        await stream.writeSSE({
          data: JSON.stringify({ type: "done" }),
          event: "done",
        });
      } catch (error) {
        await stream.writeSSE({
          data: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
          event: "error",
        });
      }
    });
  });

  return app;
}
