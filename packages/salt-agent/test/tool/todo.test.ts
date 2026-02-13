import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { TodoWriteTool, TodoReadTool } from "../../src/tool/todo.js"
import { Storage } from "../../src/storage/storage.js"
import type { Tool } from "../../src/tool/tool.js"

const testDir = path.join(os.tmpdir(), `salt-todo-test-${Date.now()}`)
process.env["SALT_DATA_DIR"] = testDir

async function cleanup() {
  await fs.rm(testDir, { recursive: true, force: true })
  Storage.reset()
}

function mockContext(overrides?: Partial<Tool.Context>): Tool.Context {
  return {
    sessionID: "ses_todo_test",
    messageID: "msg_todo_test",
    agent: "build",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => {},
    ask: async () => {},
    ...overrides,
  }
}

describe("TodoWriteTool", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("has id 'todowrite'", () => {
    expect(TodoWriteTool.id).toBe("todowrite")
  })

  it("writes todos and returns count", async () => {
    const info = await TodoWriteTool.init()
    const ctx = mockContext()

    const result = await info.execute(
      {
        todos: [
          { id: "1", content: "Task 1", status: "pending" },
          { id: "2", content: "Task 2", status: "completed" },
        ],
      },
      ctx,
    )

    expect(result.title).toBe("1 todos") // 1 non-completed
    expect(result.output).toContain("Task 1")
    expect(result.output).toContain("Task 2")
  })
})

describe("TodoReadTool", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("has id 'todoread'", () => {
    expect(TodoReadTool.id).toBe("todoread")
  })

  it("reads empty todos returns empty array", async () => {
    const info = await TodoReadTool.init()
    const ctx = mockContext()

    const result = await info.execute({}, ctx)
    expect(result.title).toBe("0 todos")
    expect(result.output).toBe("[]")
  })

  it("reads previously written todos", async () => {
    const writeInfo = await TodoWriteTool.init()
    const readInfo = await TodoReadTool.init()
    const ctx = mockContext()

    await writeInfo.execute(
      {
        todos: [
          { id: "t1", content: "Do something", status: "in_progress" },
        ],
      },
      ctx,
    )

    const result = await readInfo.execute({}, ctx)
    expect(result.title).toBe("1 todos")
    expect(result.output).toContain("Do something")
  })
})
