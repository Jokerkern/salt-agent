import { describe, it, expect } from "vitest"
import { PlanEnterTool, PlanExitTool } from "../../src/tool/plan.js"

describe("PlanEnterTool", () => {
  it("has id 'plan_enter'", () => {
    expect(PlanEnterTool.id).toBe("plan_enter")
  })

  it("init returns description and empty parameters", async () => {
    const info = await PlanEnterTool.init()
    expect(info.description).toContain("计划模式")
    expect(info.parameters).toBeDefined()
  })
})

describe("PlanExitTool", () => {
  it("has id 'plan_exit'", () => {
    expect(PlanExitTool.id).toBe("plan_exit")
  })

  it("init returns description and empty parameters", async () => {
    const info = await PlanExitTool.init()
    expect(info.description).toContain("构建代理")
    expect(info.parameters).toBeDefined()
  })
})
