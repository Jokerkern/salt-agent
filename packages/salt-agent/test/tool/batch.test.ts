import { describe, it, expect } from "vitest"
import { BatchTool } from "../../src/tool/batch.js"

describe("BatchTool", () => {
  it("has id 'batch'", () => {
    expect(BatchTool.id).toBe("batch")
  })

  it("init returns description and parameters", async () => {
    const info = await BatchTool.init()
    expect(info.description).toContain("并行")
    expect(info.parameters).toBeDefined()
  })

  it("parameters accept tool_calls array", async () => {
    const info = await BatchTool.init()
    const parsed = info.parameters.parse({
      tool_calls: [
        { tool: "read", parameters: { filePath: "/test.ts" } },
        { tool: "grep", parameters: { pattern: "hello" } },
      ],
    })
    expect(parsed.tool_calls).toHaveLength(2)
    expect(parsed.tool_calls[0]!.tool).toBe("read")
  })

  it("parameters reject empty tool_calls", async () => {
    const info = await BatchTool.init()
    expect(() => info.parameters.parse({ tool_calls: [] })).toThrow()
  })

  it("formatValidationError produces readable message", async () => {
    const info = await BatchTool.init()
    expect(info.formatValidationError).toBeDefined()

    if (info.formatValidationError) {
      const result = info.parameters.safeParse({ tool_calls: [] })
      if (!result.success) {
        const msg = info.formatValidationError(result.error)
        expect(msg).toContain("无效")
        expect(msg).toContain("期望")
      }
    }
  })
})
