import { describe, it, expect } from "vitest"
import { GrepTool } from "../../src/tool/grep.js"

describe("GrepTool", () => {
  it("has id 'grep'", () => {
    expect(GrepTool.id).toBe("grep")
  })

  it("init returns description and parameters", async () => {
    const info = await GrepTool.init()
    expect(info.description).toContain("ripgrep")
    expect(info.parameters).toBeDefined()
  })

  it("parameters accept pattern and optional path/include", async () => {
    const info = await GrepTool.init()
    const parsed = info.parameters.parse({
      pattern: "function\\s+\\w+",
      path: "/src",
      include: "*.ts",
    })
    expect(parsed.pattern).toBe("function\\s+\\w+")
    expect(parsed.path).toBe("/src")
    expect(parsed.include).toBe("*.ts")
  })

  it("pattern is required", async () => {
    const info = await GrepTool.init()
    expect(() => info.parameters.parse({})).toThrow()
  })
})
