import { Hono } from "hono"
import {
  sessionExists,
  createSession,
  addMessage,
  buildCoreMessages,
  updateSession,
  getSession,
  getDefaultProviderConfig,
  resolveModel,
  getAgent,
  getDefaultAgent,
  runAgentLoop,
  getWorkplaceDir,
} from "@salt-agent/core"

// ---------------------------------------------------------------------------
// IM types
// ---------------------------------------------------------------------------

interface IMMessage {
  session_id?: string
  user_id: string
  message: string
  callback_url: string
  metadata?: Record<string, unknown>
}

interface IMResponse {
  session_id: string
  response_text: string
  status: "success" | "error"
  error?: string
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
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    }
  } catch (error) {
    console.error("Failed to send callback:", error)
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function createIMRoutes() {
  const app = new Hono()

  app.post("/message", async (c) => {
    try {
      const body: IMMessage = await c.req.json()

      if (!body.user_id || !body.message || !body.callback_url) {
        return c.json({ error: "Missing required fields: user_id, message, callback_url" }, 400)
      }

      let sessionId = body.session_id
      if (!sessionId || !sessionExists(sessionId)) {
        const session = createSession()
        sessionId = session.id
      }

      const capturedSessionId = sessionId

      // Fire-and-forget: process in background
      void (async () => {
        const providerConfig = getDefaultProviderConfig()
        if (!providerConfig || !providerConfig.modelId) {
          await sendCallback(body.callback_url, {
            session_id: capturedSessionId,
            response_text: "No provider configured",
            status: "error",
            error: "Please configure a provider with an API key and model",
          })
          return
        }

        const model = resolveModel(providerConfig)
        const session = getSession(capturedSessionId)
        if (!session) return
        const agentInfo = getAgent(session.agent) ?? getDefaultAgent()

        // Persist user message
        addMessage({
          sessionId: capturedSessionId,
          role: "user",
          content: [{ type: "text", text: body.message }],
        })

        // Update title from first message
        if (session.title.startsWith("New session -")) {
          const title = body.message.length > 50 ? body.message.slice(0, 47) + "..." : body.message
          updateSession(capturedSessionId, { title })
        }

        const coreMessages = buildCoreMessages(capturedSessionId)

        let assistantText = ""
        let error: string | undefined = undefined

        try {
          const events = runAgentLoop({
            model,
            agent: agentInfo,
            messages: coreMessages,
            cwd: getWorkplaceDir(),
          })

          for await (const event of events) {
            if (event.type === "text-end") {
              assistantText += event.text
            }
            if (event.type === "error") {
              error = event.error
            }
          }
        } catch (err: unknown) {
          error = (err as Error).message ?? String(err)
        }

        // Persist assistant response
        if (assistantText) {
          addMessage({
            sessionId: capturedSessionId,
            role: "assistant",
            content: [{ type: "text", text: assistantText }],
            modelId: providerConfig.modelId ?? undefined,
            providerId: providerConfig.providerId ?? undefined,
          })
        }

        await sendCallback(body.callback_url, {
          session_id: capturedSessionId,
          response_text: assistantText || "No response",
          status: error ? "error" : "success",
          error,
        })
      })()

      return c.json({ session_id: sessionId, status: "accepted" }, 202)
    } catch (error) {
      console.error("IM webhook error:", error)
      return c.json({ error: "Internal server error" }, 500)
    }
  })

  return app
}
