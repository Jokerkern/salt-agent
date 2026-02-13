import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs/promises"
import path from "path"
import os from "os"
import z from "zod"
import { MessageV2 } from "../../src/session/message.js"
import { NamedError } from "../../src/util/error.js"
import { Storage } from "../../src/storage/storage.js"

const testDir = path.join(os.tmpdir(), `salt-message-test-${Date.now()}`)
process.env["SALT_DATA_DIR"] = testDir

async function cleanup() {
  await fs.rm(testDir, { recursive: true, force: true })
  Storage.reset()
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

describe("MessageV2 error types", () => {
  it("OutputLengthError", () => {
    const err = new MessageV2.OutputLengthError({})
    expect(err.name).toBe("MessageOutputLengthError")
    expect(MessageV2.OutputLengthError.isInstance(err)).toBe(true)
  })

  it("AbortedError", () => {
    const err = new MessageV2.AbortedError({ message: "cancelled" })
    expect(err.name).toBe("MessageAbortedError")
    expect(err.data.message).toBe("cancelled")
    expect(MessageV2.AbortedError.isInstance(err)).toBe(true)
  })

  it("AuthError", () => {
    const err = new MessageV2.AuthError({ providerID: "openai", message: "bad key" })
    expect(err.name).toBe("ProviderAuthError")
    expect(err.data.providerID).toBe("openai")
  })

  it("APIError", () => {
    const err = new MessageV2.APIError({
      message: "rate limit",
      statusCode: 429,
      isRetryable: true,
    })
    expect(err.name).toBe("APIError")
    expect(err.data.statusCode).toBe(429)
    expect(err.data.isRetryable).toBe(true)
  })

  it("ContextOverflowError", () => {
    const err = new MessageV2.ContextOverflowError({ message: "too long" })
    expect(err.name).toBe("ContextOverflowError")
  })

  it("StructuredOutputError", () => {
    const err = new MessageV2.StructuredOutputError({ message: "parse fail", retries: 3 })
    expect(err.name).toBe("StructuredOutputError")
    expect(err.data.retries).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Part schemas
// ---------------------------------------------------------------------------

describe("MessageV2 Part schemas", () => {
  it("TextPart validates minimal", () => {
    const result = MessageV2.TextPart.parse({
      id: "prt_1",
      sessionID: "ses_1",
      messageID: "msg_1",
      type: "text",
      text: "hello",
    })
    expect(result.type).toBe("text")
    expect(result.text).toBe("hello")
  })

  it("ReasoningPart validates", () => {
    const result = MessageV2.ReasoningPart.parse({
      id: "prt_1",
      sessionID: "ses_1",
      messageID: "msg_1",
      type: "reasoning",
      text: "thinking",
      time: { start: 1000 },
    })
    expect(result.type).toBe("reasoning")
  })

  it("FilePart validates", () => {
    const result = MessageV2.FilePart.parse({
      id: "prt_1",
      sessionID: "ses_1",
      messageID: "msg_1",
      type: "file",
      mime: "image/png",
      url: "data:image/png;base64,abc",
    })
    expect(result.type).toBe("file")
    expect(result.mime).toBe("image/png")
  })

  it("ToolPart validates all states", () => {
    const states = [
      { status: "pending", input: {}, raw: "" },
      { status: "running", input: {}, time: { start: 1000 } },
      {
        status: "completed",
        input: {},
        output: "done",
        title: "t",
        metadata: {},
        time: { start: 1000, end: 2000 },
      },
      {
        status: "error",
        input: {},
        error: "fail",
        time: { start: 1000, end: 2000 },
      },
    ]
    for (const state of states) {
      const result = MessageV2.ToolPart.parse({
        id: "prt_1",
        sessionID: "ses_1",
        messageID: "msg_1",
        type: "tool",
        callID: "c1",
        tool: "read",
        state,
      })
      expect(result.state.status).toBe(state.status)
    }
  })

  it("ToolState discriminatedUnion rejects invalid status", () => {
    expect(() =>
      MessageV2.ToolState.parse({ status: "invalid", input: {} }),
    ).toThrow()
  })

  it("Part discriminatedUnion accepts text, reasoning, tool, file", () => {
    expect(
      MessageV2.Part.parse({
        id: "p", sessionID: "s", messageID: "m",
        type: "text", text: "hi",
      }).type,
    ).toBe("text")

    expect(
      MessageV2.Part.parse({
        id: "p", sessionID: "s", messageID: "m",
        type: "reasoning", text: "t", time: { start: 0 },
      }).type,
    ).toBe("reasoning")

    expect(
      MessageV2.Part.parse({
        id: "p", sessionID: "s", messageID: "m",
        type: "tool", callID: "c", tool: "t",
        state: { status: "pending", input: {}, raw: "" },
      }).type,
    ).toBe("tool")

    expect(
      MessageV2.Part.parse({
        id: "p", sessionID: "s", messageID: "m",
        type: "file", mime: "text/plain", url: "data:,",
      }).type,
    ).toBe("file")
  })
})

// ---------------------------------------------------------------------------
// Message schemas
// ---------------------------------------------------------------------------

describe("MessageV2 Info schemas", () => {
  it("User message validates", () => {
    const result = MessageV2.User.parse({
      id: "msg_1",
      sessionID: "ses_1",
      role: "user",
      time: { created: Date.now() },
      agent: "build",
      model: { providerID: "openai", modelID: "gpt-4o" },
    })
    expect(result.role).toBe("user")
  })

  it("Assistant message validates", () => {
    const result = MessageV2.Assistant.parse({
      id: "msg_1",
      sessionID: "ses_1",
      role: "assistant",
      time: { created: Date.now() },
      parentID: "msg_0",
      modelID: "gpt-4o",
      providerID: "openai",
      mode: "build",
      agent: "build",
      path: { cwd: "/tmp", root: "/tmp" },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    })
    expect(result.role).toBe("assistant")
  })

  it("Info discriminatedUnion accepts both roles", () => {
    const user = MessageV2.Info.parse({
      id: "m1", sessionID: "s1", role: "user",
      time: { created: 0 }, agent: "a", model: { providerID: "p", modelID: "m" },
    })
    expect(user.role).toBe("user")

    const asst = MessageV2.Info.parse({
      id: "m2", sessionID: "s1", role: "assistant",
      time: { created: 0 }, parentID: "m1", modelID: "m",
      providerID: "p", mode: "n", agent: "a",
      path: { cwd: "/", root: "/" }, cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    })
    expect(asst.role).toBe("assistant")
  })

  it("WithParts validates", () => {
    const result = MessageV2.WithParts.parse({
      info: {
        id: "m1", sessionID: "s1", role: "user",
        time: { created: 0 }, agent: "a",
        model: { providerID: "p", modelID: "m" },
      },
      parts: [
        { id: "p1", sessionID: "s1", messageID: "m1", type: "text", text: "hi" },
      ],
    })
    expect(result.parts).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// fromError
// ---------------------------------------------------------------------------

describe("MessageV2.fromError", () => {
  it("converts AbortError (DOMException)", () => {
    const e = new DOMException("aborted", "AbortError")
    const result = MessageV2.fromError(e, { providerID: "openai" })
    expect(result.name).toBe("MessageAbortedError")
  })

  it("converts unknown Error to UnknownError", () => {
    const e = new Error("something broke")
    const result = MessageV2.fromError(e, { providerID: "openai" })
    expect(result.name).toBe("UnknownError")
  })

  it("converts non-Error to UnknownError", () => {
    const result = MessageV2.fromError("string error", { providerID: "openai" })
    expect(result.name).toBe("UnknownError")
  })

  it("preserves OutputLengthError", () => {
    const err = new MessageV2.OutputLengthError({})
    const result = MessageV2.fromError(err, { providerID: "openai" })
    expect(MessageV2.OutputLengthError.isInstance(result)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

describe("MessageV2.Event", () => {
  it("Updated event is defined", () => {
    expect(MessageV2.Event.Updated.type).toBe("message.updated")
  })

  it("Removed event is defined", () => {
    expect(MessageV2.Event.Removed.type).toBe("message.removed")
  })

  it("PartUpdated event is defined", () => {
    expect(MessageV2.Event.PartUpdated.type).toBe("message.part.updated")
  })

  it("PartRemoved event is defined", () => {
    expect(MessageV2.Event.PartRemoved.type).toBe("message.part.removed")
  })
})
