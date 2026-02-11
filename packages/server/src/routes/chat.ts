import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import {
  sessionExists,
  createSession,
  getSession,
  updateSession,
  addMessage,
  buildCoreMessages,
  getDefaultProviderConfig,
  resolveModel,
  getAgent,
  getDefaultAgent,
  runAgentLoop,
  getWorkplaceDir,
  type AgentEvent,
  type ContentBlock,
} from "@salt-agent/core"

export function createChatRoutes() {
  const app = new Hono()

  // POST /send — create or validate session, return session_id
  app.post("/send", async (c) => {
    try {
      const body = await c.req.json()
      const { message, session_id } = body

      if (!message) {
        return c.json({ error: "Missing required field: message" }, 400)
      }

      let sessionId = session_id
      if (!sessionId || !sessionExists(sessionId)) {
        const session = createSession()
        sessionId = session.id
      }

      return c.json({ session_id: sessionId })
    } catch (error) {
      console.error("Chat send error:", error)
      return c.json({ error: "Internal server error" }, 500)
    }
  })

  // GET /stream/:sessionId — SSE stream for chat
  app.get("/stream/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId")
    const message = c.req.query("message")

    if (!message) {
      return c.json({ error: "Missing query parameter: message" }, 400)
    }

    if (!sessionExists(sessionId)) {
      return c.json({ error: "Session not found" }, 404)
    }

    // Resolve provider and model
    const providerConfig = getDefaultProviderConfig()
    if (!providerConfig || !providerConfig.modelId) {
      return c.json({ error: "No provider configured. Please add a provider with a model." }, 400)
    }

    const model = resolveModel(providerConfig)
    const session = getSession(sessionId)!
    const agentInfo = getAgent(session.agent) ?? getDefaultAgent()

    // Persist user message
    addMessage({
      sessionId,
      role: "user",
      content: [{ type: "text", text: message }],
    })

    // Update session title from first message
    if (session.title.startsWith("New session -")) {
      const title = message.length > 50 ? message.slice(0, 47) + "..." : message
      updateSession(sessionId, { title })
    }

    // Build message history for LLM
    const coreMessages = buildCoreMessages(sessionId)

    return streamSSE(c, async (stream) => {
      const controller = new AbortController()

      // Close on client disconnect
      c.req.raw.signal.addEventListener("abort", () => {
        controller.abort()
      })

      const assistantContent: ContentBlock[] = []
      let totalTokensInput = 0
      let totalTokensOutput = 0
      let lastFinishReason = "stop"

      try {
        const events = runAgentLoop({
          model,
          agent: agentInfo,
          messages: coreMessages,
          cwd: getWorkplaceDir(),
          abort: controller.signal,
        })

        for await (const event of events) {
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event),
          })

          // Collect content blocks for persistence
          collectContent(event, assistantContent)

          if (event.type === "step-finish" && event.tokens) {
            totalTokensInput += event.tokens.input
            totalTokensOutput += event.tokens.output
          }
          if (event.type === "done") {
            lastFinishReason = event.finishReason
          }
        }
      } catch (error) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            type: "error",
            error: error instanceof Error ? error.message : String(error),
          }),
        })
      }

      // Persist assistant response
      if (assistantContent.length > 0) {
        addMessage({
          sessionId,
          role: "assistant",
          content: assistantContent,
          tokensInput: totalTokensInput,
          tokensOutput: totalTokensOutput,
          modelId: providerConfig.modelId,
          providerId: providerConfig.providerId,
          finishReason: lastFinishReason,
        })
      }
    })
  })

  return app
}

/**
 * Collect content blocks from agent events for message persistence.
 */
function collectContent(event: AgentEvent, content: ContentBlock[]): void {
  switch (event.type) {
    case "text-end":
      content.push({ type: "text", text: event.text })
      break
    case "tool-call-args":
      content.push({
        type: "tool-call",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
      })
      break
    case "tool-result":
      content.push({
        type: "tool-result",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        result: event.result,
      })
      break
    case "tool-error":
      content.push({
        type: "tool-result",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        result: event.error,
        isError: true,
      })
      break
  }
}
