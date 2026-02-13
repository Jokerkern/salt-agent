import { describe, it, expect } from "vitest"
import { SessionProcessor } from "../../src/session/processor.js"

describe("SessionProcessor", () => {
  it("create returns an object with process method", () => {
    const processor = SessionProcessor.create({
      assistantMessage: {
        id: "msg_test",
        sessionID: "ses_test",
        role: "assistant",
        time: { created: Date.now() },
        parentID: "msg_parent",
        modelID: "gpt-4o",
        providerID: "openai",
        mode: "build",
        agent: "build",
        path: { cwd: "/tmp", root: "/tmp" },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      },
      sessionID: "ses_test",
      model: {
        id: "gpt-4o",
        name: "GPT-4o",
        providerID: "openai",
        provider: "OpenAI",
        capabilities: {
          temperature: true,
          images: true,
          pdf: false,
          reasoning: false,
        },
        cost: { input: 0.005, output: 0.015 },
        limit: { context: 128000, output: 4096 },
        options: {},
        status: "ga",
      } as any,
      abort: new AbortController().signal,
    })

    expect(processor).toBeDefined()
    expect(typeof processor.process).toBe("function")
    expect(typeof processor.partFromToolCall).toBe("function")
  })

  it("message getter returns the assistant message", () => {
    const msg = {
      id: "msg_test2",
      sessionID: "ses_test",
      role: "assistant" as const,
      time: { created: Date.now() },
      parentID: "msg_parent",
      modelID: "gpt-4o",
      providerID: "openai",
      mode: "build",
      agent: "build",
      path: { cwd: "/tmp", root: "/tmp" },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    }

    const processor = SessionProcessor.create({
      assistantMessage: msg,
      sessionID: "ses_test",
      model: {} as any,
      abort: new AbortController().signal,
    })

    expect(processor.message.id).toBe("msg_test2")
  })

  it("partFromToolCall returns undefined for unknown toolCallID", () => {
    const processor = SessionProcessor.create({
      assistantMessage: {
        id: "msg_x",
        sessionID: "ses_x",
        role: "assistant",
        time: { created: Date.now() },
        parentID: "p",
        modelID: "m",
        providerID: "p",
        mode: "build",
        agent: "build",
        path: { cwd: "/", root: "/" },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      },
      sessionID: "ses_x",
      model: {} as any,
      abort: new AbortController().signal,
    })

    expect(processor.partFromToolCall("nonexistent")).toBeUndefined()
  })
})
