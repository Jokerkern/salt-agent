import { Hono } from "hono"
import { stream } from "hono/streaming"
import { Session } from "../../session/session.js"
import { SessionStatus } from "../../session/status.js"
import { MessageV2 } from "../../session/message.js"
import { SessionPrompt } from "../../session/prompt.js"
import { lazy } from "../../util/lazy.js"

export const SessionRoutes = lazy(() =>
  new Hono()
    // -----------------------------------------------------------------------
    // List sessions
    // -----------------------------------------------------------------------
    .get("/", async (c) => {
      const search = c.req.query("search")?.toLowerCase()
      const limitStr = c.req.query("limit")
      const limit = limitStr ? Number(limitStr) : undefined
      const roots = c.req.query("roots") === "true"

      const sessions: Session.Info[] = []
      for await (const session of Session.list()) {
        if (roots && session.parentID) continue
        if (search && !session.title.toLowerCase().includes(search)) continue
        sessions.push(session)
        if (limit !== undefined && sessions.length >= limit) break
      }
      return c.json(sessions)
    })

    // -----------------------------------------------------------------------
    // Get session
    // -----------------------------------------------------------------------
    .get("/:sessionID", async (c) => {
      const sessionID = c.req.param("sessionID")
      const session = await Session.get(sessionID)
      return c.json(session)
    })

    // -----------------------------------------------------------------------
    // Get session children (sub-agent sessions)
    // -----------------------------------------------------------------------
    .get("/:sessionID/children", async (c) => {
      const parentID = c.req.param("sessionID")
      const children: Session.Info[] = []
      for await (const session of Session.list()) {
        if (session.parentID === parentID) {
          children.push(session)
        }
      }
      return c.json(children)
    })

    // -----------------------------------------------------------------------
    // Create session
    // -----------------------------------------------------------------------
    .post("/", async (c) => {
      const body = await c.req.json().catch(() => ({}))
      const session = await Session.create(body)
      return c.json(session)
    })

    // -----------------------------------------------------------------------
    // Delete session
    // -----------------------------------------------------------------------
    .delete("/:sessionID", async (c) => {
      const sessionID = c.req.param("sessionID")
      await Session.remove(sessionID)
      return c.json(true)
    })

    // -----------------------------------------------------------------------
    // Update session
    // -----------------------------------------------------------------------
    .patch("/:sessionID", async (c) => {
      const sessionID = c.req.param("sessionID")
      const updates = await c.req.json<{ title?: string }>()

      const updatedSession = await Session.update(
        sessionID,
        (session) => {
          if (updates.title !== undefined) {
            session.title = updates.title
          }
        },
        { touch: false },
      )

      return c.json(updatedSession)
    })

    // -----------------------------------------------------------------------
    // Session status (busy / idle / retry)
    // -----------------------------------------------------------------------
    .get("/status", async (c) => {
      return c.json(SessionStatus.list())
    })

    // -----------------------------------------------------------------------
    // Abort session
    // -----------------------------------------------------------------------
    .post("/:sessionID/abort", async (c) => {
      SessionPrompt.cancel(c.req.param("sessionID"))
      return c.json(true)
    })

    // -----------------------------------------------------------------------
    // Get session messages
    // -----------------------------------------------------------------------
    .get("/:sessionID/message", async (c) => {
      const sessionID = c.req.param("sessionID")
      const limitStr = c.req.query("limit")
      const limit = limitStr ? Number(limitStr) : undefined
      const messages = await Session.messages({ sessionID, limit })
      return c.json(messages)
    })

    // -----------------------------------------------------------------------
    // Get specific message
    // -----------------------------------------------------------------------
    .get("/:sessionID/message/:messageID", async (c) => {
      const sessionID = c.req.param("sessionID")
      const messageID = c.req.param("messageID")
      const message = await MessageV2.get({ sessionID, messageID })
      return c.json(message)
    })

    // -----------------------------------------------------------------------
    // Delete message part
    // -----------------------------------------------------------------------
    .delete("/:sessionID/message/:messageID/part/:partID", async (c) => {
      const sessionID = c.req.param("sessionID")
      const messageID = c.req.param("messageID")
      const partID = c.req.param("partID")
      await Session.removePart({ sessionID, messageID, partID })
      return c.json(true)
    })

    // -----------------------------------------------------------------------
    // Update message part
    // -----------------------------------------------------------------------
    .patch("/:sessionID/message/:messageID/part/:partID", async (c) => {
      const body = await c.req.json<MessageV2.Part>()
      const part = await Session.updatePart(body)
      return c.json(part)
    })

    // -----------------------------------------------------------------------
    // Send message (streaming)
    // -----------------------------------------------------------------------
    .post("/:sessionID/message", async (c) => {
      c.status(200)
      c.header("Content-Type", "application/json")
      return stream(c, async (s) => {
        const sessionID = c.req.param("sessionID")
        const body = await c.req.json<Omit<SessionPrompt.PromptInput, "sessionID">>()
        const msg = await SessionPrompt.prompt({ ...body, sessionID })
        s.write(JSON.stringify(msg))
      })
    })

    // -----------------------------------------------------------------------
    // Send async message (non-blocking)
    // -----------------------------------------------------------------------
    .post("/:sessionID/prompt_async", async (c) => {
      const sessionID = c.req.param("sessionID")
      const body = await c.req.json<Omit<SessionPrompt.PromptInput, "sessionID">>()
      // Fire and forget — don't await the prompt
      SessionPrompt.prompt({ ...body, sessionID })
      return c.json(true, 202)
    }),
)
