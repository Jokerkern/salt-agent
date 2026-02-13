import { describe, it, expect } from "vitest"
import { GlobTool } from "../../src/tool/glob.js"

describe("GlobTool", () => {
  it("has id 'glob'", () => {
    expect(GlobTool.id).toBe("glob")
  })

  it("init returns description and parameters", async () => {
    const info = await GlobTool.init()
    expect(info.description).toBeDefined()
    expect(info.parameters).toBeDefined()
  })

  it("parameters accept pattern and optional path", async () => {
    const info = await GlobTool.init()
    const parsed = info.parameters.parse({
      pattern: "**/*.ts",
      path: "/src",
    })
    expect(parsed.pattern).toBe("**/*.ts")
    expect(parsed.path).toBe("/src")
  })

  it("pattern is required", async () => {
    const info = await GlobTool.init()
    expect(() => info.parameters.parse({})).toThrow()
  })
})
