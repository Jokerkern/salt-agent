import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs/promises"
import path from "path"
import os from "os"
import z from "zod"
import { Tool } from "../../src/tool/tool.js"
import { Storage } from "../../src/storage/storage.js"

const testDir = path.join(os.tmpdir(), `salt-tool-test-${Date.now()}`)
process.env["SALT_DATA_DIR"] = testDir

async function cleanup() {
  await fs.rm(testDir, { recursive: true, force: true })
  Storage.reset()
}

function mockContext(overrides?: Partial<Tool.Context>): Tool.Context {
  return {
    sessionID: "ses_test",
    messageID: "msg_test",
    agent: "build",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => {},
    ask: async () => {},
    ...overrides,
  }
}

describe("Tool.define", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("creates a tool with id", () => {
    const myTool = Tool.define("my_tool", {
      description: "A test tool",
      parameters: z.object({ name: z.string() }),
      async execute(params) {
        return {
          title: "test",
          output: `Hello ${params.name}`,
          metadata: {},
        }
      },
    })
    expect(myTool.id).toBe("my_tool")
  })

  it("init returns tool info with description and parameters", async () => {
    const myTool = Tool.define("init_test", {
      description: "Test desc",
      parameters: z.object({ x: z.number() }),
      async execute(params) {
        return { title: "t", output: String(params.x), metadata: {} }
      },
    })

    const info = await myTool.init()
    expect(info.description).toBe("Test desc")
    expect(info.parameters).toBeDefined()
  })

  it("executes with valid params", async () => {
    const myTool = Tool.define("exec_test", {
      description: "Test",
      parameters: z.object({ value: z.string() }),
      async execute(params) {
        return { title: "t", output: params.value, metadata: {} }
      },
    })

    const info = await myTool.init()
    const result = await info.execute({ value: "hello" }, mockContext())
    expect(result.output).toContain("hello")
  })

  it("throws on invalid params", async () => {
    const myTool = Tool.define("invalid_params", {
      description: "Test",
      parameters: z.object({ count: z.number() }),
      async execute(params) {
        return { title: "t", output: String(params.count), metadata: {} }
      },
    })

    const info = await myTool.init()
    await expect(
      info.execute({ count: "not a number" } as any, mockContext()),
    ).rejects.toThrow("无效参数")
  })

  it("uses custom formatValidationError when provided", async () => {
    const myTool = Tool.define("custom_format", {
      description: "Test",
      parameters: z.object({ n: z.number() }),
      formatValidationError(error) {
        return `Custom: ${error.issues.length} issues`
      },
      async execute(params) {
        return { title: "t", output: "", metadata: {} }
      },
    })

    const info = await myTool.init()
    await expect(
      info.execute({ n: "bad" } as any, mockContext()),
    ).rejects.toThrow("Custom: 1 issues")
  })

  it("auto-truncates output", async () => {
    const longOutput = "x\n".repeat(3000) // Over MAX_LINES
    const myTool = Tool.define("truncation_test", {
      description: "Test",
      parameters: z.object({}),
      async execute() {
        return { title: "t", output: longOutput, metadata: {} }
      },
    })

    const info = await myTool.init()
    const result = await info.execute({}, mockContext())
    expect(result.metadata.truncated).toBe(true)
    expect(result.output.length).toBeLessThan(longOutput.length)
  })

  it("skips truncation when metadata.truncated is set", async () => {
    const myTool = Tool.define("no_truncate", {
      description: "Test",
      parameters: z.object({}),
      async execute() {
        return { title: "t", output: "short", metadata: { truncated: false } }
      },
    })

    const info = await myTool.init()
    const result = await info.execute({}, mockContext())
    expect(result.output).toBe("short")
    expect(result.metadata.truncated).toBe(false)
  })

  it("supports async init function", async () => {
    const myTool = Tool.define("async_init", async () => {
      return {
        description: "Async init",
        parameters: z.object({}),
        async execute() {
          return { title: "t", output: "async", metadata: {} }
        },
      }
    })

    const info = await myTool.init()
    expect(info.description).toBe("Async init")
  })
})
