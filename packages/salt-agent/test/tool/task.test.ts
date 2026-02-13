import { describe, it, expect } from "vitest"
import { TaskTool } from "../../src/tool/task.js"

describe("TaskTool", () => {
  it("has id 'task'", () => {
    expect(TaskTool.id).toBe("task")
  })

  it("init returns description with available agents", async () => {
    const info = await TaskTool.init()
    expect(info.description).toContain("子代理")
    // Should list subagent-mode agents
    expect(info.description).toContain("general")
    expect(info.description).toContain("explore")
  })

  it("init filters agents by caller permission", async () => {
    // With a restrictive caller that denies task for certain agents
    const info = await TaskTool.init({
      agent: {
        name: "test",
        permission: [
          { permission: "task", pattern: "general", action: "deny" },
        ],
      },
    })
    // general should be filtered out
    expect(info.description).not.toContain("general")
    expect(info.description).toContain("explore")
  })

  it("parameters accept description, prompt, subagent_type", async () => {
    const info = await TaskTool.init()
    const parsed = info.parameters.parse({
      description: "Test task",
      prompt: "Do something",
      subagent_type: "general",
    })
    expect(parsed.description).toBe("Test task")
    expect(parsed.prompt).toBe("Do something")
    expect(parsed.subagent_type).toBe("general")
  })

  it("parameters accept optional task_id", async () => {
    const info = await TaskTool.init()
    const parsed = info.parameters.parse({
      description: "Resume task",
      prompt: "Continue",
      subagent_type: "general",
      task_id: "ses_abc123",
    })
    expect(parsed.task_id).toBe("ses_abc123")
  })
})
