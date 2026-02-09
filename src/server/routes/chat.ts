import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { SessionManager, AgentSession } from "../../session/index.js";
import { DEFAULT_TOOLS } from "../../tools/index.js";
import { config } from "../../config.js";

export function createChatRoutes(sessionManager: SessionManager) {
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
        sessionId = await sessionManager.createSession("web");
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

        await agentSession.loadMessages();

        const agent = agentSession.getAgent();

        agent.subscribe(async (event) => {
          await stream.writeSSE({
            data: JSON.stringify(event),
            event: event.type,
          });
        });

        await agentSession.prompt(message);

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
