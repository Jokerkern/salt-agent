import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { WriteTool } from "../../src/tool/write.js"
import { Workspace } from "../../src/workspace/workspace.js"
import { Storage } from "../../src/storage/storage.js"
import type { Tool } from "../../src/tool/tool.js"

const testDir = path.join(os.tmpdir(), `salt-write-test-${Date.now()}`)
const fixtureDir = path.join(testDir, "fixtures")
process.env["SALT_DATA_DIR"] = testDir

async function cleanup() {
  await fs.rm(testDir, { recursive: true, force: true })
  Storage.reset()
}

function mockContext(overrides?: Partial<Tool.Context>): Tool.Context {
  return {
    sessionID: "ses_write_test",
    messageID: "msg_write_test",
    agent: "build",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => {},
    ask: async () => {},
    ...overrides,
  }
}

describe("WriteTool", () => {
  beforeEach(async () => {
    await cleanup()
    await fs.mkdir(fixtureDir, { recursive: true })
    Workspace.setDirectory(fixtureDir)
  })
  afterEach(cleanup)

  it("has id 'write'", () => {
    expect(WriteTool.id).toBe("write")
  })

  it("creates a new file", async () => {
    const filePath = path.join(fixtureDir, "new-file.txt")
    const info = await WriteTool.init()
    const result = await info.execute(
      { filePath, content: "hello world" },
      mockContext(),
    )

    expect(result.output).toContain("成功")
    const content = await fs.readFile(filePath, "utf-8")
    expect(content).toBe("hello world")
  })

  it("overwrites existing file", async () => {
    const filePath = path.join(fixtureDir, "existing.txt")
    await fs.writeFile(filePath, "old content")

    const info = await WriteTool.init()
    const result = await info.execute(
      { filePath, content: "new content" },
      mockContext(),
    )

    expect(result.output).toContain("成功")
    expect(result.metadata.exists).toBe(true)
    const content = await fs.readFile(filePath, "utf-8")
    expect(content).toBe("new content")
  })

  it("creates parent directories", async () => {
    const filePath = path.join(fixtureDir, "deep", "nested", "file.txt")
    const info = await WriteTool.init()
    await info.execute(
      { filePath, content: "nested content" },
      mockContext(),
    )

    const content = await fs.readFile(filePath, "utf-8")
    expect(content).toBe("nested content")
  })

  it("title is relative path", async () => {
    const filePath = path.join(fixtureDir, "src", "main.ts")
    const info = await WriteTool.init()
    const result = await info.execute(
      { filePath, content: "code" },
      mockContext(),
    )

    expect(result.title).not.toContain(fixtureDir)
    expect(result.title).toContain("main.ts")
  })
})
