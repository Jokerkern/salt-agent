import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { ReadTool } from "../../src/tool/read.js"
import { Workspace } from "../../src/workspace/workspace.js"
import { Storage } from "../../src/storage/storage.js"
import type { Tool } from "../../src/tool/tool.js"

const testDir = path.join(os.tmpdir(), `salt-read-test-${Date.now()}`)
const fixtureDir = path.join(testDir, "fixtures")
process.env["SALT_DATA_DIR"] = testDir

async function cleanup() {
  await fs.rm(testDir, { recursive: true, force: true })
  Storage.reset()
}

function mockContext(overrides?: Partial<Tool.Context>): Tool.Context {
  return {
    sessionID: "ses_read_test",
    messageID: "msg_read_test",
    agent: "build",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => {},
    ask: async () => {},
    ...overrides,
  }
}

describe("ReadTool", () => {
  beforeEach(async () => {
    await cleanup()
    await fs.mkdir(fixtureDir, { recursive: true })
    // Set workspace to fixture dir to bypass external directory check
    Workspace.setDirectory(fixtureDir)
  })
  afterEach(cleanup)

  it("has id 'read'", () => {
    expect(ReadTool.id).toBe("read")
  })

  it("reads a text file", async () => {
    const filePath = path.join(fixtureDir, "test.txt")
    await fs.writeFile(filePath, "line 1\nline 2\nline 3")

    const info = await ReadTool.init()
    const result = await info.execute({ filePath }, mockContext())

    expect(result.output).toContain("line 1")
    expect(result.output).toContain("line 2")
    expect(result.output).toContain("line 3")
    expect(result.output).toContain("<type>file</type>")
  })

  it("reads a directory", async () => {
    await fs.writeFile(path.join(fixtureDir, "a.ts"), "")
    await fs.writeFile(path.join(fixtureDir, "b.ts"), "")

    const info = await ReadTool.init()
    const result = await info.execute({ filePath: fixtureDir }, mockContext())

    expect(result.output).toContain("<type>directory</type>")
    expect(result.output).toContain("a.ts")
    expect(result.output).toContain("b.ts")
  })

  it("throws on non-existent file", async () => {
    const info = await ReadTool.init()
    await expect(
      info.execute(
        { filePath: path.join(fixtureDir, "nonexistent.ts") },
        mockContext(),
      ),
    ).rejects.toThrow("文件未找到")
  })

  it("respects offset and limit", async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`)
    const filePath = path.join(fixtureDir, "long.txt")
    await fs.writeFile(filePath, lines.join("\n"))

    const info = await ReadTool.init()
    const result = await info.execute({ filePath, offset: 5, limit: 3 }, mockContext())

    expect(result.output).toContain("line 5")
    expect(result.output).toContain("line 7")
    expect(result.output).not.toContain("line 4")
    expect(result.output).not.toContain("line 8")
  })

  it("throws on offset < 1", async () => {
    const filePath = path.join(fixtureDir, "test.txt")
    await fs.writeFile(filePath, "content")

    const info = await ReadTool.init()
    await expect(
      info.execute({ filePath, offset: 0 }, mockContext()),
    ).rejects.toThrow("offset 必须大于或等于 1")
  })

  it("throws on binary file", async () => {
    const filePath = path.join(fixtureDir, "binary.zip")
    // Write binary content with null bytes
    await fs.writeFile(filePath, Buffer.from([0x00, 0x01, 0x02, 0x00]))

    const info = await ReadTool.init()
    await expect(
      info.execute({ filePath }, mockContext()),
    ).rejects.toThrow("二进制文件")
  })

  it("reads empty file without error", async () => {
    const filePath = path.join(fixtureDir, "empty.txt")
    await fs.writeFile(filePath, "")

    const info = await ReadTool.init()
    const result = await info.execute({ filePath }, mockContext())
    expect(result.output).toContain("<type>file</type>")
  })
})
