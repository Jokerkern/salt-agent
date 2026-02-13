import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { BashTool } from "../../src/tool/bash.js"
import { Workspace } from "../../src/workspace/workspace.js"
import { Storage } from "../../src/storage/storage.js"
import type { Tool } from "../../src/tool/tool.js"

const testDir = path.join(os.tmpdir(), `salt-bash-test-${Date.now()}`)
process.env["SALT_DATA_DIR"] = testDir

async function cleanup() {
  await fs.rm(testDir, { recursive: true, force: true })
  Storage.reset()
}

function mockContext(overrides?: Partial<Tool.Context>): Tool.Context {
  return {
    sessionID: "ses_bash_test",
    messageID: "msg_bash_test",
    agent: "build",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => {},
    ask: async () => {},
    ...overrides,
  }
}

describe("BashTool", () => {
  beforeEach(async () => {
    await cleanup()
    await fs.mkdir(testDir, { recursive: true })
    Workspace.setDirectory(testDir)
  })
  afterEach(cleanup)

  it("has id 'bash'", () => {
    expect(BashTool.id).toBe("bash")
  })

  it("init returns description and parameters", async () => {
    const info = await BashTool.init()
    expect(info.description).toContain("shell")
    expect(info.parameters).toBeDefined()
  })

  it("executes simple echo command", async () => {
    const info = await BashTool.init()
    const cmd = "echo hello"
    const result = await info.execute(
      { command: cmd, timeout: 5000, description: "echo hello" },
      mockContext(),
    )
    expect(result.output).toContain("hello")
  })

  it("captures exit code in metadata", async () => {
    const info = await BashTool.init()
    const result = await info.execute(
      { command: "echo success", timeout: 5000, description: "echo success" },
      mockContext(),
    )
    expect(result.metadata.exit).toBe(0)
  })

  it("non-zero exit code is captured", async () => {
    const info = await BashTool.init()
    const cmd = process.platform === "win32"
      ? "cmd /c exit 1"
      : "exit 1"
    const result = await info.execute(
      { command: cmd, timeout: 5000, description: "exit with error" },
      mockContext(),
    )
    expect(result.metadata.exit).not.toBe(0)
  })
})
