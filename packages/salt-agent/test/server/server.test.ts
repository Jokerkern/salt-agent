import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { Server } from "../../src/server/server.js"
import { Session } from "../../src/session/session.js"
import { MessageV2 } from "../../src/session/message.js"
import { Identifier } from "../../src/id/id.js"
import { Storage } from "../../src/storage/storage.js"
import { Bus } from "../../src/bus/bus.js"
import { Config } from "../../src/config/config.js"
import { Permission } from "../../src/permission/permission.js"
import { Question } from "../../src/tool/question.js"
import { Agent } from "../../src/agent/agent.js"

const testDir = path.join(os.tmpdir(), `salt-server-test-${Date.now()}`)
process.env["SALT_DATA_DIR"] = testDir

async function cleanup() {
  await fs.rm(testDir, { recursive: true, force: true })
  Storage.reset()
  Config.reset()
  Agent.reset()
}

function app() {
  return Server.App()
}

async function json<T = unknown>(res: Response): Promise<T> {
  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUserMessage(sessionID: string): MessageV2.User {
  return {
    id: Identifier.ascending("message"),
    sessionID,
    role: "user",
    time: { created: Date.now() },
    agent: "build",
    model: { providerID: "openai", modelID: "gpt-4o" },
  }
}

function makeAssistantMessage(sessionID: string, parentID: string): MessageV2.Assistant {
  return {
    id: Identifier.ascending("message"),
    sessionID,
    role: "assistant",
    time: { created: Date.now() },
    parentID,
    modelID: "gpt-4o",
    providerID: "openai",
    mode: "build",
    agent: "build",
    path: { cwd: "/tmp", root: "/tmp" },
    cost: 0,
    tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
  }
}

function makeTextPart(sessionID: string, messageID: string): MessageV2.TextPart {
  return {
    id: Identifier.ascending("part"),
    sessionID,
    messageID,
    type: "text",
    text: "Hello world",
  }
}

// ===========================================================================
// Health check
// ===========================================================================

describe("Server: health", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("GET /health returns ok", async () => {
    const res = await app().request("/health")
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ status: "ok" })
  })
})

// ===========================================================================
// Path info
// ===========================================================================

describe("Server: path", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("GET /path returns directory info", async () => {
    const res = await app().request("/path")
    expect(res.status).toBe(200)
    const body = await json<Record<string, string>>(res)
    expect(body.data).toBeDefined()
    expect(body.config).toBeDefined()
    expect(body.storage).toBeDefined()
    expect(body.directory).toBeDefined()
    expect(body.worktree).toBeDefined()
  })
})

// ===========================================================================
// Agent list
// ===========================================================================

describe("Server: agent", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("GET /agent returns agent list", async () => {
    const res = await app().request("/agent")
    expect(res.status).toBe(200)
    const agents = await json<Array<{ name: string }>>(res)
    expect(agents.length).toBeGreaterThanOrEqual(4)
    const names = agents.map((a) => a.name)
    expect(names).toContain("build")
    expect(names).toContain("plan")
    expect(names).toContain("general")
    expect(names).toContain("explore")
  })
})

// ===========================================================================
// Session CRUD
// ===========================================================================

describe("Server: session CRUD", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("POST /session creates a session", async () => {
    const res = await app().request("/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test Session" }),
    })
    expect(res.status).toBe(200)
    const session = await json<Session.Info>(res)
    expect(session.id).toMatch(/^ses_/)
    expect(session.title).toBe("Test Session")
  })

  it("POST /session with empty body creates session with default title", async () => {
    const res = await app().request("/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(200)
    const session = await json<Session.Info>(res)
    expect(session.title).toMatch(/^New session - /)
  })

  it("GET /session lists sessions", async () => {
    // Create two sessions
    await Session.create({ title: "A" })
    await Session.create({ title: "B" })

    const res = await app().request("/session")
    expect(res.status).toBe(200)
    const sessions = await json<Session.Info[]>(res)
    expect(sessions.length).toBe(2)
  })

  it("GET /session?search= filters by title", async () => {
    await Session.create({ title: "Alpha" })
    await Session.create({ title: "Beta" })
    await Session.create({ title: "Alpha Two" })

    const res = await app().request("/session?search=alpha")
    expect(res.status).toBe(200)
    const sessions = await json<Session.Info[]>(res)
    expect(sessions.length).toBe(2)
    expect(sessions.every((s) => s.title.toLowerCase().includes("alpha"))).toBe(true)
  })

  it("GET /session?limit= limits results", async () => {
    await Session.create({ title: "A" })
    await Session.create({ title: "B" })
    await Session.create({ title: "C" })

    const res = await app().request("/session?limit=2")
    expect(res.status).toBe(200)
    const sessions = await json<Session.Info[]>(res)
    expect(sessions.length).toBe(2)
  })

  it("GET /session?roots=true filters out child sessions", async () => {
    const parent = await Session.create({ title: "Parent" })
    await Session.create({ title: "Child", parentID: parent.id })
    await Session.create({ title: "Another Root" })

    const res = await app().request("/session?roots=true")
    expect(res.status).toBe(200)
    const sessions = await json<Session.Info[]>(res)
    expect(sessions.every((s) => !s.parentID)).toBe(true)
    expect(sessions.length).toBe(2)
  })

  it("GET /session/:id returns a specific session", async () => {
    const session = await Session.create({ title: "Specific" })
    const res = await app().request(`/session/${session.id}`)
    expect(res.status).toBe(200)
    const body = await json<Session.Info>(res)
    expect(body.id).toBe(session.id)
    expect(body.title).toBe("Specific")
  })

  it("GET /session/:id returns 404 for non-existent session", async () => {
    const res = await app().request("/session/ses_000000000000xxxxxxxxxxxxxx")
    expect(res.status).toBe(404)
  })

  it("PATCH /session/:id updates title", async () => {
    const session = await Session.create({ title: "Old" })
    const res = await app().request(`/session/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New" }),
    })
    expect(res.status).toBe(200)
    const body = await json<Session.Info>(res)
    expect(body.title).toBe("New")
  })

  it("DELETE /session/:id deletes session", async () => {
    const session = await Session.create({ title: "Delete me" })
    const res = await app().request(`/session/${session.id}`, { method: "DELETE" })
    expect(res.status).toBe(200)
    expect(await json(res)).toBe(true)

    // Confirm deleted
    const getRes = await app().request(`/session/${session.id}`)
    expect(getRes.status).toBe(404)
  })

  it("POST /session/:id/abort returns true", async () => {
    const session = await Session.create({})
    const res = await app().request(`/session/${session.id}/abort`, { method: "POST" })
    expect(res.status).toBe(200)
    expect(await json(res)).toBe(true)
  })

  it("GET /session/:id/children returns child sessions", async () => {
    const parent = await Session.create({ title: "Parent" })
    const child = await Session.create({ title: "Child", parentID: parent.id })
    await Session.create({ title: "Unrelated" })

    const res = await app().request(`/session/${parent.id}/children`)
    expect(res.status).toBe(200)
    const children = await json<Session.Info[]>(res)
    expect(children.length).toBe(1)
    expect(children[0]!.id).toBe(child.id)
  })
})

// ===========================================================================
// Session messages
// ===========================================================================

describe("Server: session messages", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("GET /session/:id/message returns messages", async () => {
    const session = await Session.create({})
    const userMsg = makeUserMessage(session.id)
    await Session.updateMessage(userMsg)
    const textPart = makeTextPart(session.id, userMsg.id)
    await Session.updatePart(textPart)

    const res = await app().request(`/session/${session.id}/message`)
    expect(res.status).toBe(200)
    const msgs = await json<MessageV2.WithParts[]>(res)
    expect(msgs.length).toBe(1)
    expect(msgs[0]!.info.id).toBe(userMsg.id)
    expect(msgs[0]!.parts.length).toBe(1)
    expect(msgs[0]!.parts[0]!.type).toBe("text")
  })

  it("GET /session/:id/message?limit= limits messages", async () => {
    const session = await Session.create({})
    for (let i = 0; i < 5; i++) {
      await Session.updateMessage(makeUserMessage(session.id))
    }

    const res = await app().request(`/session/${session.id}/message?limit=3`)
    expect(res.status).toBe(200)
    const msgs = await json<MessageV2.WithParts[]>(res)
    expect(msgs.length).toBe(3)
  })

  it("GET /session/:id/message returns empty for no messages", async () => {
    const session = await Session.create({})
    const res = await app().request(`/session/${session.id}/message`)
    expect(res.status).toBe(200)
    const msgs = await json<MessageV2.WithParts[]>(res)
    expect(msgs).toEqual([])
  })

  it("GET /session/:id/message/:msgID returns specific message", async () => {
    const session = await Session.create({})
    const userMsg = makeUserMessage(session.id)
    await Session.updateMessage(userMsg)
    const part = makeTextPart(session.id, userMsg.id)
    await Session.updatePart(part)

    const res = await app().request(`/session/${session.id}/message/${userMsg.id}`)
    expect(res.status).toBe(200)
    const msg = await json<MessageV2.WithParts>(res)
    expect(msg.info.id).toBe(userMsg.id)
    expect(msg.parts.length).toBe(1)
  })

  it("DELETE /session/:id/message/:msgID/part/:partID deletes part", async () => {
    const session = await Session.create({})
    const userMsg = makeUserMessage(session.id)
    await Session.updateMessage(userMsg)
    const part = makeTextPart(session.id, userMsg.id)
    await Session.updatePart(part)

    const res = await app().request(
      `/session/${session.id}/message/${userMsg.id}/part/${part.id}`,
      { method: "DELETE" },
    )
    expect(res.status).toBe(200)
    expect(await json(res)).toBe(true)

    // Verify part is gone
    const parts = await MessageV2.parts(userMsg.id)
    expect(parts.length).toBe(0)
  })

  it("PATCH /session/:id/message/:msgID/part/:partID updates part", async () => {
    const session = await Session.create({})
    const userMsg = makeUserMessage(session.id)
    await Session.updateMessage(userMsg)
    const part = makeTextPart(session.id, userMsg.id)
    await Session.updatePart(part)

    const updated = { ...part, text: "Updated text" }
    const res = await app().request(
      `/session/${session.id}/message/${userMsg.id}/part/${part.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      },
    )
    expect(res.status).toBe(200)
    const body = await json<MessageV2.TextPart>(res)
    expect(body.type).toBe("text")
    if (body.type === "text") {
      expect(body.text).toBe("Updated text")
    }
  })
})

// ===========================================================================
// Config
// ===========================================================================

describe("Server: config", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("GET /config returns config", async () => {
    const res = await app().request("/config")
    expect(res.status).toBe(200)
    const body = await json<Config.Info>(res)
    expect(typeof body).toBe("object")
  })

  it("PATCH /config updates config", async () => {
    const res = await app().request("/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai/gpt-4o" }),
    })
    expect(res.status).toBe(200)
    const body = await json<Config.Info>(res)
    expect(body.model).toBe("openai/gpt-4o")

    // Verify persisted
    Config.reset()
    const config = await Config.get()
    expect(config.model).toBe("openai/gpt-4o")
  })

  it("GET /config/providers returns providers list", async () => {
    const res = await app().request("/config/providers")
    expect(res.status).toBe(200)
    const body = await json<{ providers: unknown[]; default: Record<string, string> }>(res)
    expect(Array.isArray(body.providers)).toBe(true)
    expect(typeof body.default).toBe("object")
  })
})

// ===========================================================================
// Permission
// ===========================================================================

describe("Server: permission", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("GET /permission returns pending list", async () => {
    const res = await app().request("/permission")
    expect(res.status).toBe(200)
    const body = await json<Permission.Request[]>(res)
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBe(0)
  })

  it("POST /permission/:id/reply replies to permission", async () => {
    // Create a pending permission via Permission.ask
    const session = await Session.create({})
    const askPromise = Permission.ask({
      sessionID: session.id,
      permission: "bash",
      patterns: ["ls"],
      metadata: {},
      always: ["*"],
      ruleset: Permission.fromConfig({ bash: "ask" }),
    })

    // Get the pending permission
    const pending = Permission.list()
    expect(pending.length).toBe(1)

    // Reply via API
    const res = await app().request(`/permission/${pending[0]!.id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply: "once" }),
    })
    expect(res.status).toBe(200)
    expect(await json(res)).toBe(true)

    // The ask promise should resolve
    await askPromise
  })
})

// ===========================================================================
// Question
// ===========================================================================

describe("Server: question", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("GET /question returns list", async () => {
    const res = await app().request("/question")
    expect(res.status).toBe(200)
    const body = await json<unknown[]>(res)
    expect(Array.isArray(body)).toBe(true)
  })

  it("POST /question/:id/reply replies to question", async () => {
    // Create a pending question
    const session = await Session.create({})
    const askPromise = Question.ask({
      sessionID: session.id,
      questions: [{ question: "Pick one", options: [{ label: "A" }, { label: "B" }] }],
    })

    // Wait for event to propagate
    await new Promise((r) => setTimeout(r, 10))

    // We need the question ID — capture from event
    let questionID = ""
    const unsub = Bus.subscribe(Question.Event.Asked, (e) => {
      questionID = e.properties.id
    })

    // Ask again to capture the ID (the first one already fired)
    const askPromise2 = Question.ask({
      sessionID: session.id,
      questions: [{ question: "Pick again", options: [{ label: "X" }, { label: "Y" }] }],
    })
    unsub()

    // Reply to the second question via API
    const res = await app().request(`/question/${questionID}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: [["X"]] }),
    })
    expect(res.status).toBe(200)
    expect(await json(res)).toBe(true)

    const answers = await askPromise2
    expect(answers).toEqual([["X"]])
  })

  it("POST /question/:id/reject rejects question", async () => {
    const res = await app().request("/question/nonexistent/reject", { method: "POST" })
    expect(res.status).toBe(200)
    expect(await json(res)).toBe(true)
  })
})

// ===========================================================================
// Auth routes
// ===========================================================================

describe("Server: auth", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("PUT /auth/:providerID sets credential", async () => {
    const res = await app().request("/auth/openai", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "api", key: "sk-test-key" }),
    })
    expect(res.status).toBe(200)
    expect(await json(res)).toBe(true)
  })

  it("DELETE /auth/:providerID removes credential", async () => {
    // First set one
    await app().request("/auth/openai", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "api", key: "sk-test-key" }),
    })

    const res = await app().request("/auth/openai", { method: "DELETE" })
    expect(res.status).toBe(200)
    expect(await json(res)).toBe(true)
  })
})

// ===========================================================================
// Error handling
// ===========================================================================

describe("Server: error handling", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("returns 404 for not found resources", async () => {
    const res = await app().request("/session/ses_nonexistent_id_xxxxxxxxxxx")
    expect(res.status).toBe(404)
    const body = await json<{ name: string }>(res)
    expect(body.name).toBe("NotFoundError")
  })

  it("returns 200 for unknown routes (Hono default)", async () => {
    const res = await app().request("/nonexistent/route")
    expect(res.status).toBe(404) // Hono returns 404 for unmatched routes
  })
})

// ===========================================================================
// SSE event stream
// ===========================================================================

describe("Server: SSE", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("GET /event returns SSE stream with server.connected", async () => {
    const res = await app().request("/event")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")

    // Read the first SSE chunk
    const reader = res.body!.getReader()
    const { value } = await reader.read()
    const text = new TextDecoder().decode(value)

    expect(text).toContain("server.connected")
    reader.cancel()
  })
})
