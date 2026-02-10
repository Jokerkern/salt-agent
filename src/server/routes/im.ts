import { Hono } from "hono";
import { SessionManager, AgentSession } from "../../session/index.js";
import { DEFAULT_TOOLS } from "../../tools/index.js";
import { IMAdapter } from "../../im/index.js";
import type { IMMessage, IMResponse } from "../../im/types.js";
import { config } from "../../config.js";

export function createIMRoutes(sessionManager: SessionManager) {
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

      // Create agent session
      const agentSession = new AgentSession(sessionId, sessionManager, {
        initialState: {
          systemPrompt: "你是一个专业的编程助手。你可以读取文件、编写代码、执行命令，帮助用户完成各种编程任务。",
          model: {
            id: config.defaultModel,
            name: "OpenAI GPT",
            provider: "openai",
            baseUrl: config.openaiBaseUrl,
            input: ["text"],
            contextWindow: 128000,
            maxTokens: 16384,
          },
          tools: DEFAULT_TOOLS,
        },
        getApiKey: async () => config.openaiApiKey,
      });

      // Load existing messages
      await agentSession.loadMessages();

      // Process message asynchronously
      (async () => {
        try {
          const agent = agentSession.getAgent();
          let responseText = "";

          agent.subscribe((event) => {
            if (event.type === "message_end" && event.message.role === "assistant") {
              const textContent = event.message.content.filter((c) => c.type === "text");
              responseText = textContent.map((c: any) => c.text).join("\n");
            }
          });

          await agentSession.prompt(body.message);

          const response: IMResponse = {
            session_id: sessionId,
            response_text: responseText || "No response",
            status: "success",
          };

          await imAdapter.sendCallback(body.callback_url, response);
        } catch (error) {
          const response: IMResponse = {
            session_id: sessionId!,
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
