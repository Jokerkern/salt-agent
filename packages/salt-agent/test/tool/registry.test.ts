import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs/promises"
import path from "path"
import os from "os"
import z from "zod"
import { ToolRegistry } from "../../src/tool/registry.js"
import { Tool } from "../../src/tool/tool.js"
import { Storage } from "../../src/storage/storage.js"

const testDir = path.join(os.tmpdir(), `salt-registry-test-${Date.now()}`)
process.env["SALT_DATA_DIR"] = testDir

async function cleanup() {
  await fs.rm(testDir, { recursive: true, force: true })
  Storage.reset()
}

describe("ToolRegistry", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("ids returns list of tool IDs", () => {
    const ids = ToolRegistry.ids()
    expect(Array.isArray(ids)).toBe(true)
    expect(ids.length).toBeGreaterThan(0)
  })

  it("includes core built-in tools", () => {
    const ids = ToolRegistry.ids()
    expect(ids).toContain("read")
    expect(ids).toContain("bash")
    expect(ids).toContain("grep")
    expect(ids).toContain("glob")
    expect(ids).toContain("edit")
    expect(ids).toContain("write")
    expect(ids).toContain("todowrite")
    expect(ids).toContain("todoread")
    expect(ids).toContain("question")
    expect(ids).toContain("task")
    expect(ids).toContain("invalid")
    expect(ids).toContain("list")
  })

  it("includes plan tools", () => {
    const ids = ToolRegistry.ids()
    expect(ids).toContain("plan_enter")
    expect(ids).toContain("plan_exit")
  })

  it("includes stub tools", () => {
    const ids = ToolRegistry.ids()
    expect(ids).toContain("skill")
    expect(ids).toContain("apply_patch")
  })

  it("tools() returns initialized tools for a model", async () => {
    const tools = await ToolRegistry.tools({
      modelID: "claude-sonnet-4-20250514",
      providerID: "anthropic",
    })
    expect(tools.length).toBeGreaterThan(0)
    // Each tool should have id, description, parameters, execute
    for (const tool of tools) {
      expect(typeof tool.id).toBe("string")
      expect(typeof tool.description).toBe("string")
      expect(tool.parameters).toBeDefined()
      expect(typeof tool.execute).toBe("function")
    }
  })

  it("filters apply_patch for non-gpt models", async () => {
    const tools = await ToolRegistry.tools({
      modelID: "claude-sonnet-4-20250514",
      providerID: "anthropic",
    })
    const ids = tools.map((t) => t.id)
    expect(ids).not.toContain("apply_patch")
    expect(ids).toContain("edit")
    expect(ids).toContain("write")
  })

  it("register adds custom tool", async () => {
    const custom = Tool.define("custom_test_tool", {
      description: "Custom tool",
      parameters: z.object({}),
      async execute() {
        return { title: "custom", output: "ok", metadata: {} }
      },
    })

    await ToolRegistry.register(custom)
    const ids = ToolRegistry.ids()
    expect(ids).toContain("custom_test_tool")
  })

  it("register replaces tool with same id", async () => {
    const v1 = Tool.define("replaceable_tool", {
      description: "v1",
      parameters: z.object({}),
      async execute() {
        return { title: "v1", output: "v1", metadata: {} }
      },
    })

    const v2 = Tool.define("replaceable_tool", {
      description: "v2",
      parameters: z.object({}),
      async execute() {
        return { title: "v2", output: "v2", metadata: {} }
      },
    })

    await ToolRegistry.register(v1)
    await ToolRegistry.register(v2)

    // Should only have one instance
    const count = ToolRegistry.ids().filter((id) => id === "replaceable_tool").length
    expect(count).toBe(1)
  })
})
