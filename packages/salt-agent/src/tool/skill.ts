import z from "zod"
import { Tool } from "./tool.js"

// TODO: Full implementation requires a Skill discovery/loading system.
// Skills are specialized instruction sets loaded from config directories.

const DESCRIPTION = `加载提供领域特定指令和工作流的专用技能。

用法：
- 提供要加载的技能名称
- 技能内容会注入到对话上下文中

注意：此工具需 Skill 系统。当前为占位实现，Skill 发现功能可用后将完整实现。`

export const SkillTool = Tool.define("skill", {
  description: DESCRIPTION,
  parameters: z.object({
    name: z.string().describe("要加载的技能名称"),
  }),
  async execute(_params, _ctx) {
    throw new Error(
      "skill 工具尚未实现。需 Skill 发现系统。",
    )
  },
})
