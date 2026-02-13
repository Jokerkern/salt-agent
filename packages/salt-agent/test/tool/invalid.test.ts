import { describe, it, expect } from "vitest"
import { InvalidTool } from "../../src/tool/invalid.js"

describe("InvalidTool", () => {
  it("has id 'invalid'", () => {
    expect(InvalidTool.id).toBe("invalid")
  })

  it("init returns description and parameters", async () => {
    const info = await InvalidTool.init()
    expect(info.description).toBeDefined()
    expect(info.parameters).toBeDefined()
  })

  it("execute returns error message with tool name", async () => {
    const info = await InvalidTool.init()
    const result = await info.execute(
      { tool: "nonexistent", error: "tool not found" },
      {} as any,
    )
    expect(result.title).toBe("无效工具")
    expect(result.output).toContain("无效")
    expect(result.output).toContain("tool not found")
  })
})
