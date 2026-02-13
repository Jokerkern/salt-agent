import { describe, it, expect } from "vitest"
import { SkillTool } from "../../src/tool/skill.js"

describe("SkillTool (stub)", () => {
  it("has id 'skill'", () => {
    expect(SkillTool.id).toBe("skill")
  })

  it("init returns description and parameters", async () => {
    const info = await SkillTool.init()
    expect(info.description).toContain("技能")
    expect(info.parameters).toBeDefined()
  })

  it("execute throws not-implemented error", async () => {
    const info = await SkillTool.init()
    await expect(
      info.execute({ name: "test-skill" }, {} as any),
    ).rejects.toThrow("尚未实现")
  })
})
