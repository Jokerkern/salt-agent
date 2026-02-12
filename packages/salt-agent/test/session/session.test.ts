import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { Bus } from "../../src/bus/bus.js"
import { Identifier } from "../../src/id/id.js"
import { Session } from "../../src/session/session.js"
import { MessageV2 } from "../../src/session/message.js"
import { Storage } from "../../src/storage/storage.js"

const testDir = path.join(os.tmpdir(), `salt-session-test-${Date.now()}`)
process.env["SALT_DATA_DIR"] = testDir

async function cleanup() {
  await fs.rm(testDir, { recursive: true, force: true })
  Storage.reset()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUserMessage(sessionID: string, overrides?: Partial<MessageV2.User>): MessageV2.User {
  return {
    id: Identifier.ascending("message"),
    sessionID,
    role: "user",
    time: { created: Date.now() },
    agent: "default",
    model: { providerID: "openai", modelID: "gpt-4o" },
    ...overrides,
  }
}

function makeAssistantMessage(
  sessionID: string,
  parentID: string,
  overrides?: Partial<MessageV2.Assistant>,
): MessageV2.Assistant {
  return {
    id: Identifier.ascending("message"),
    sessionID,
    role: "assistant",
    time: { created: Date.now() },
    parentID,
    modelID: "gpt-4o",
    providerID: "openai",
    mode: "normal",
    agent: "default",
    path: { cwd: "/tmp", root: "/tmp" },
    cost: 0,
    tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
    ...overrides,
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

function makeToolPart(sessionID: string, messageID: string): MessageV2.ToolPart {
  return {
    id: Identifier.ascending("part"),
    sessionID,
    messageID,
    type: "tool",
    callID: "call_123",
    tool: "read",
    state: {
      status: "completed",
      input: { path: "/tmp/test.ts" },
      output: "file contents",
      title: "Read /tmp/test.ts",
      metadata: {},
      time: { start: Date.now() - 100, end: Date.now() },
    },
  }
}

// ---------------------------------------------------------------------------
// Session CRUD
// ---------------------------------------------------------------------------

describe("Session", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("create with default title", async () => {
    const session = await Session.create({})
    expect(session.id).toMatch(/^ses_/)
    expect(session.title).toMatch(/^New session - /)
    expect(session.time.created).toBeGreaterThan(0)
    expect(session.time.updated).toBe(session.time.created)
  })

  it("create with custom title", async () => {
    const session = await Session.create({ title: "My session" })
    expect(session.title).toBe("My session")
  })

  it("create publishes Created and Updated events", async () => {
    const events: string[] = []
    const unsub1 = Bus.subscribe(Session.Event.Created, () => events.push("created"))
    const unsub2 = Bus.subscribe(Session.Event.Updated, () => events.push("updated"))

    await Session.create({})

    unsub1()
    unsub2()
    expect(events).toEqual(["created", "updated"])
  })

  it("get returns created session", async () => {
    const session = await Session.create({ title: "get test" })
    const fetched = await Session.get(session.id)
    expect(fetched.id).toBe(session.id)
    expect(fetched.title).toBe("get test")
  })

  it("get non-existent session throws", async () => {
    await expect(Session.get("ses_000000000000xxxxxxxxxxxxxx")).rejects.toThrow()
  })

  it("list yields all sessions", async () => {
    await Session.create({ title: "A" })
    await Session.create({ title: "B" })
    await Session.create({ title: "C" })

    const sessions: Session.Info[] = []
    for await (const s of Session.list()) {
      sessions.push(s)
    }
    expect(sessions).toHaveLength(3)
  })

  it("update modifies session and publishes event", async () => {
    const session = await Session.create({ title: "old" })
    let eventFired = false
    const unsub = Bus.subscribe(Session.Event.Updated, () => {
      eventFired = true
    })

    const updated = await Session.update(session.id, (draft) => {
      draft.title = "new"
    })

    unsub()
    expect(updated.title).toBe("new")
    expect(updated.time.updated).toBeGreaterThanOrEqual(session.time.updated)
    expect(eventFired).toBe(true)
  })

  it("update with touch: false does not change time.updated", async () => {
    const session = await Session.create({})
    const originalUpdated = session.time.updated

    // small delay to ensure Date.now() would differ
    await new Promise((r) => setTimeout(r, 10))

    const updated = await Session.update(
      session.id,
      (draft) => {
        draft.title = "no-touch"
      },
      { touch: false },
    )

    expect(updated.title).toBe("no-touch")
    expect(updated.time.updated).toBe(originalUpdated)
  })

  it("remove deletes session and publishes Deleted event", async () => {
    const session = await Session.create({})
    let deleted = false
    const unsub = Bus.subscribe(Session.Event.Deleted, () => {
      deleted = true
    })

    await Session.remove(session.id)
    unsub()

    expect(deleted).toBe(true)
    await expect(Session.get(session.id)).rejects.toThrow()
  })

  it("remove cascades to messages and parts", async () => {
    const session = await Session.create({})
    const userMsg = makeUserMessage(session.id)
    await Session.updateMessage(userMsg)

    const part = makeTextPart(session.id, userMsg.id)
    await Session.updatePart(part)

    // verify they exist before remove
    const msgsBefore = await Session.messages({ sessionID: session.id })
    expect(msgsBefore).toHaveLength(1)
    expect(msgsBefore[0]!.parts).toHaveLength(1)

    await Session.remove(session.id)

    // messages and parts should be gone
    const msgKeys = await Storage.list(["message", session.id])
    expect(msgKeys).toHaveLength(0)
    const partKeys = await Storage.list(["part", userMsg.id])
    expect(partKeys).toHaveLength(0)
  })

  it("isDefaultTitle identifies default titles", () => {
    expect(Session.isDefaultTitle("New session - 2026-02-12T07:00:00.000Z")).toBe(true)
    expect(Session.isDefaultTitle("My custom title")).toBe(false)
    expect(Session.isDefaultTitle("New session - incomplete")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Message operations
// ---------------------------------------------------------------------------

describe("Session message operations", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("updateMessage stores and publishes event", async () => {
    const session = await Session.create({})
    const msg = makeUserMessage(session.id)
    let eventInfo: MessageV2.Info | undefined

    const unsub = Bus.subscribe(MessageV2.Event.Updated, (e) => {
      eventInfo = e.properties.info
    })

    await Session.updateMessage(msg)
    unsub()

    expect(eventInfo).toBeDefined()
    expect(eventInfo!.id).toBe(msg.id)

    const fetched = await MessageV2.get({ sessionID: session.id, messageID: msg.id })
    expect(fetched.info.id).toBe(msg.id)
  })

  it("updateMessage works with assistant messages", async () => {
    const session = await Session.create({})
    const userMsg = makeUserMessage(session.id)
    await Session.updateMessage(userMsg)

    const assistantMsg = makeAssistantMessage(session.id, userMsg.id)
    await Session.updateMessage(assistantMsg)

    const fetched = await MessageV2.get({ sessionID: session.id, messageID: assistantMsg.id })
    expect(fetched.info.role).toBe("assistant")
    if (fetched.info.role === "assistant") {
      expect(fetched.info.parentID).toBe(userMsg.id)
    }
  })

  it("removeMessage deletes message and publishes event", async () => {
    const session = await Session.create({})
    const msg = makeUserMessage(session.id)
    await Session.updateMessage(msg)

    let removed = false
    const unsub = Bus.subscribe(MessageV2.Event.Removed, () => {
      removed = true
    })

    await Session.removeMessage({ sessionID: session.id, messageID: msg.id })
    unsub()

    expect(removed).toBe(true)
    await expect(MessageV2.get({ sessionID: session.id, messageID: msg.id })).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Part operations
// ---------------------------------------------------------------------------

describe("Session part operations", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("updatePart stores part directly", async () => {
    const session = await Session.create({})
    const msg = makeUserMessage(session.id)
    await Session.updateMessage(msg)

    const part = makeTextPart(session.id, msg.id)
    let eventPart: MessageV2.Part | undefined

    const unsub = Bus.subscribe(MessageV2.Event.PartUpdated, (e) => {
      eventPart = e.properties.part
    })

    await Session.updatePart(part)
    unsub()

    expect(eventPart).toBeDefined()
    expect(eventPart!.type).toBe("text")

    const parts = await MessageV2.parts(msg.id)
    expect(parts).toHaveLength(1)
    expect(parts[0]!.type).toBe("text")
  })

  it("updatePart with delta publishes delta in event", async () => {
    const session = await Session.create({})
    const msg = makeUserMessage(session.id)
    await Session.updateMessage(msg)

    const part: MessageV2.TextPart = {
      id: Identifier.ascending("part"),
      sessionID: session.id,
      messageID: msg.id,
      type: "text",
      text: "Hello",
    }

    let eventDelta: string | undefined
    const unsub = Bus.subscribe(MessageV2.Event.PartUpdated, (e) => {
      eventDelta = e.properties.delta
    })

    await Session.updatePart({ part, delta: " world" })
    unsub()

    expect(eventDelta).toBe(" world")
  })

  it("updatePart stores tool part", async () => {
    const session = await Session.create({})
    const msg = makeAssistantMessage(session.id, "msg_placeholder")
    await Session.updateMessage(msg)

    const toolPart = makeToolPart(session.id, msg.id)
    await Session.updatePart(toolPart)

    const parts = await MessageV2.parts(msg.id)
    expect(parts).toHaveLength(1)
    expect(parts[0]!.type).toBe("tool")
    if (parts[0]!.type === "tool") {
      expect(parts[0]!.tool).toBe("read")
      expect(parts[0]!.state.status).toBe("completed")
    }
  })

  it("removePart deletes part and publishes event", async () => {
    const session = await Session.create({})
    const msg = makeUserMessage(session.id)
    await Session.updateMessage(msg)

    const part = makeTextPart(session.id, msg.id)
    await Session.updatePart(part)

    let removed = false
    const unsub = Bus.subscribe(MessageV2.Event.PartRemoved, () => {
      removed = true
    })

    await Session.removePart({ sessionID: session.id, messageID: msg.id, partID: part.id })
    unsub()

    expect(removed).toBe(true)
    const parts = await MessageV2.parts(msg.id)
    expect(parts).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Query: messages + stream
// ---------------------------------------------------------------------------

describe("Session.messages and MessageV2.stream", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("messages returns messages with parts in chronological order", async () => {
    const session = await Session.create({})

    const user1 = makeUserMessage(session.id)
    await Session.updateMessage(user1)
    const textPart = makeTextPart(session.id, user1.id)
    await Session.updatePart(textPart)

    const assistant1 = makeAssistantMessage(session.id, user1.id)
    await Session.updateMessage(assistant1)
    const toolPart = makeToolPart(session.id, assistant1.id)
    await Session.updatePart(toolPart)

    const msgs = await Session.messages({ sessionID: session.id })

    expect(msgs).toHaveLength(2)
    // chronological order (ascending IDs first)
    expect(msgs[0]!.info.id).toBe(user1.id)
    expect(msgs[0]!.parts).toHaveLength(1)
    expect(msgs[0]!.parts[0]!.type).toBe("text")

    expect(msgs[1]!.info.id).toBe(assistant1.id)
    expect(msgs[1]!.parts).toHaveLength(1)
    expect(msgs[1]!.parts[0]!.type).toBe("tool")
  })

  it("messages respects limit", async () => {
    const session = await Session.create({})

    for (let i = 0; i < 5; i++) {
      const msg = makeUserMessage(session.id)
      await Session.updateMessage(msg)
    }

    const limited = await Session.messages({ sessionID: session.id, limit: 3 })
    expect(limited).toHaveLength(3)
  })

  it("messages returns empty array for session with no messages", async () => {
    const session = await Session.create({})
    const msgs = await Session.messages({ sessionID: session.id })
    expect(msgs).toEqual([])
  })

  it("MessageV2.stream yields messages newest-first", async () => {
    const session = await Session.create({})

    const msg1 = makeUserMessage(session.id)
    await Session.updateMessage(msg1)
    const msg2 = makeUserMessage(session.id)
    await Session.updateMessage(msg2)
    const msg3 = makeUserMessage(session.id)
    await Session.updateMessage(msg3)

    const streamed: MessageV2.WithParts[] = []
    for await (const m of MessageV2.stream(session.id)) {
      streamed.push(m)
    }

    // stream yields newest first (descending storage order for ascending IDs = last stored first)
    expect(streamed).toHaveLength(3)
    expect(streamed[0]!.info.id).toBe(msg3.id)
    expect(streamed[2]!.info.id).toBe(msg1.id)
  })

  it("MessageV2.parts returns parts sorted by ID", async () => {
    const session = await Session.create({})
    const msg = makeUserMessage(session.id)
    await Session.updateMessage(msg)

    const p1 = makeTextPart(session.id, msg.id)
    const p2 = makeToolPart(session.id, msg.id)
    // write in any order
    await Session.updatePart(p2)
    await Session.updatePart(p1)

    const parts = await MessageV2.parts(msg.id)
    expect(parts).toHaveLength(2)
    // sorted by id ascending
    expect(parts[0]!.id < parts[1]!.id).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// MessageV2 schema validation
// ---------------------------------------------------------------------------

describe("MessageV2 schemas", () => {
  it("TextPart accepts optional fields", () => {
    const result = MessageV2.TextPart.parse({
      id: "prt_test",
      sessionID: "ses_test",
      messageID: "msg_test",
      type: "text",
      text: "hello",
      synthetic: true,
      ignored: false,
      metadata: { key: "value" },
    })
    expect(result.synthetic).toBe(true)
    expect(result.ignored).toBe(false)
    expect(result.metadata).toEqual({ key: "value" })
  })

  it("ReasoningPart accepts metadata", () => {
    const result = MessageV2.ReasoningPart.parse({
      id: "prt_test",
      sessionID: "ses_test",
      messageID: "msg_test",
      type: "reasoning",
      text: "thinking...",
      metadata: { provider: "anthropic" },
      time: { start: 1000 },
    })
    expect(result.metadata).toEqual({ provider: "anthropic" })
  })

  it("ToolPart accepts metadata", () => {
    const result = MessageV2.ToolPart.parse({
      id: "prt_test",
      sessionID: "ses_test",
      messageID: "msg_test",
      type: "tool",
      callID: "call_1",
      tool: "bash",
      state: { status: "pending", input: {}, raw: "" },
      metadata: { extra: "info" },
    })
    expect(result.metadata).toEqual({ extra: "info" })
  })

  it("ToolStateCompleted accepts compacted time", () => {
    const result = MessageV2.ToolStateCompleted.parse({
      status: "completed",
      input: {},
      output: "done",
      title: "test",
      metadata: {},
      time: { start: 1000, end: 2000, compacted: 3000 },
    })
    expect(result.time.compacted).toBe(3000)
  })

  it("User message accepts optional fields", () => {
    const result = MessageV2.User.parse({
      id: "msg_test",
      sessionID: "ses_test",
      role: "user",
      time: { created: Date.now() },
      agent: "default",
      model: { providerID: "openai", modelID: "gpt-4o" },
      system: "You are a helpful assistant",
      tools: { read: true, bash: false },
      variant: "compact",
    })
    expect(result.system).toBe("You are a helpful assistant")
    expect(result.tools).toEqual({ read: true, bash: false })
    expect(result.variant).toBe("compact")
  })

  it("Assistant message accepts all new fields", () => {
    const result = MessageV2.Assistant.parse({
      id: "msg_test",
      sessionID: "ses_test",
      role: "assistant",
      time: { created: Date.now(), completed: Date.now() },
      parentID: "msg_parent",
      modelID: "gpt-4o",
      providerID: "openai",
      mode: "normal",
      agent: "default",
      path: { cwd: "/home", root: "/home" },
      summary: true,
      cost: 0.001,
      tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } },
      structured: { key: "value" },
      variant: "full",
      finish: "stop",
    })
    expect(result.mode).toBe("normal")
    expect(result.agent).toBe("default")
    expect(result.path).toEqual({ cwd: "/home", root: "/home" })
    expect(result.summary).toBe(true)
    expect(result.structured).toEqual({ key: "value" })
    expect(result.variant).toBe("full")
    expect(result.finish).toBe("stop")
  })

  it("Assistant error supports all error types", () => {
    const errors = [
      { name: "ProviderAuthError", data: { providerID: "openai", message: "invalid key" } },
      { name: "UnknownError", data: { message: "something went wrong" } },
      { name: "MessageOutputLengthError", data: {} },
      { name: "MessageAbortedError", data: { message: "user cancelled" } },
      { name: "StructuredOutputError", data: { message: "parse failed", retries: 3 } },
      { name: "ContextOverflowError", data: { message: "too long" } },
      { name: "APIError", data: { message: "rate limit", isRetryable: true } },
    ]
    for (const error of errors) {
      const result = MessageV2.Assistant.parse({
        id: "msg_test",
        sessionID: "ses_test",
        role: "assistant",
        time: { created: Date.now() },
        error,
        parentID: "msg_parent",
        modelID: "gpt-4o",
        providerID: "openai",
        mode: "normal",
        agent: "default",
        path: { cwd: "/tmp", root: "/tmp" },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      })
      expect(result.error?.name).toBe(error.name)
    }
  })

  it("Part discriminatedUnion accepts all part types", () => {
    const text = MessageV2.Part.parse({
      id: "prt_1", sessionID: "ses_1", messageID: "msg_1",
      type: "text", text: "hello",
    })
    expect(text.type).toBe("text")

    const reasoning = MessageV2.Part.parse({
      id: "prt_2", sessionID: "ses_1", messageID: "msg_1",
      type: "reasoning", text: "thinking", time: { start: 1000 },
    })
    expect(reasoning.type).toBe("reasoning")

    const tool = MessageV2.Part.parse({
      id: "prt_3", sessionID: "ses_1", messageID: "msg_1",
      type: "tool", callID: "c1", tool: "read",
      state: { status: "pending", input: {}, raw: "" },
    })
    expect(tool.type).toBe("tool")
  })
})
