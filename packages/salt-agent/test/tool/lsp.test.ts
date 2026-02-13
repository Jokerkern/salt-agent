import { describe, it, expect } from "vitest"
import { LspTool } from "../../src/tool/lsp.js"

describe("LspTool (stub)", () => {
  it("has id 'lsp'", () => {
    expect(LspTool.id).toBe("lsp")
  })

  it("init returns description and parameters", async () => {
    const info = await LspTool.init()
    expect(info.description).toContain("LSP")
    expect(info.parameters).toBeDefined()
  })

  it("execute throws not-implemented error", async () => {
    const info = await LspTool.init()
    await expect(
      info.execute(
        { operation: "goToDefinition", filePath: "/test.ts", line: 1, character: 1 },
        {} as any,
      ),
    ).rejects.toThrow("尚未实现")
  })
})
