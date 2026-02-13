import { describe, it, expect } from "vitest"
import { ListTool, IGNORE_PATTERNS } from "../../src/tool/ls.js"

describe("ListTool", () => {
  it("has id 'list'", () => {
    expect(ListTool.id).toBe("list")
  })

  it("init returns description and parameters", async () => {
    const info = await ListTool.init()
    expect(info.description).toBeDefined()
    expect(info.parameters).toBeDefined()
  })

  it("parameters accept optional path", async () => {
    const info = await ListTool.init()
    const parsed = info.parameters.parse({ path: "/src" })
    expect(parsed.path).toBe("/src")
  })

  it("parameters work without path", async () => {
    const info = await ListTool.init()
    const parsed = info.parameters.parse({})
    expect(parsed.path).toBeUndefined()
  })
})

describe("IGNORE_PATTERNS", () => {
  it("contains common ignore patterns", () => {
    expect(IGNORE_PATTERNS).toContain("node_modules/")
    expect(IGNORE_PATTERNS).toContain(".git/")
    expect(IGNORE_PATTERNS).toContain("dist/")
  })

  it("is a non-empty array", () => {
    expect(IGNORE_PATTERNS.length).toBeGreaterThan(0)
  })
})
