import { describe, it, expect } from "vitest"
import { ApplyPatchTool } from "../../src/tool/apply-patch.js"

describe("ApplyPatchTool (stub)", () => {
  it("has id 'apply_patch'", () => {
    expect(ApplyPatchTool.id).toBe("apply_patch")
  })

  it("init returns description and parameters", async () => {
    const info = await ApplyPatchTool.init()
    expect(info.description).toContain("diff")
    expect(info.parameters).toBeDefined()
  })

  it("execute throws not-implemented error", async () => {
    const info = await ApplyPatchTool.init()
    await expect(
      info.execute({ patchText: "--- a/file\n+++ b/file\n" }, {} as any),
    ).rejects.toThrow("尚未实现")
  })
})
