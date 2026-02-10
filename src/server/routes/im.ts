import { Hono } from "hono";
import { SaltSessionManager } from "../../session/index.js";
import { type Skill, formatSkillsForPrompt } from "../../skills/index.js";
import { IMAdapter } from "../../im/index.js";
import type { IMMessage, IMResponse } from "../../im/types.js";
import { runAgent } from "../../runner/index.js";
import { config } from "../../config.js";

const SYSTEM_PROMPT_BASE = "你是一个专业的编程助手。你可以读取文件、编写代码、执行命令，帮助用户完成各种编程任务。";

export function createIMRoutes(sessionManager: SaltSessionManager, skills: Skill[] = []) {
  const app = new Hono();
  const imAdapter = new IMAdapter();

  app.post("/message", async (c) => {
    try {
      const body: IMMessage = await c.req.json();

      // Validate request
      if (!body.user_id || !body.message || !body.callback_url) {
        return c.json({ error: "Missing required fields: user_id, message, callback_url" }, 400);
      }

      // Get or create session
      let sessionId = body.session_id;
      if (!sessionId || !(await sessionManager.sessionExists(sessionId))) {
        sessionId = await sessionManager.createSession("im", body.user_id, body.message);
      }

      // Process message asynchronously
      const capturedSessionId = sessionId;
      (async () => {
        try {
          const skillsPrompt = formatSkillsForPrompt(skills);
          const systemPrompt = SYSTEM_PROMPT_BASE + skillsPrompt;

          const result = await runAgent({
            sessionId: capturedSessionId,
            sessionFile: sessionManager.getSessionFile(capturedSessionId),
            prompt: body.message,
            systemPrompt,
            apiKey: config.openaiApiKey,
            baseUrl: config.openaiBaseUrl,
            modelId: "",
            agentDir: config.agentDir,
            cwd: process.cwd(),
            onUserMessage: async (msg) => {
              await sessionManager.updateTitleIfNeeded(capturedSessionId, msg);
            },
          });

          const response: IMResponse = {
            session_id: capturedSessionId,
            response_text: result.assistantText || "No response",
            status: result.error ? "error" : "success",
            error: result.error,
          };

          await imAdapter.sendCallback(body.callback_url, response);
        } catch (error) {
          const response: IMResponse = {
            session_id: capturedSessionId,
            response_text: "",
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          };
          await imAdapter.sendCallback(body.callback_url, response);
        }
      })();

      return c.json({ session_id: sessionId, status: "accepted" }, 202);
    } catch (error) {
      console.error("IM webhook error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  return app;
}
