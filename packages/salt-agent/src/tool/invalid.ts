import z from "zod"
import { Tool } from "./tool.js"

export const InvalidTool = Tool.define("invalid", {
  description: "请勿使用",
  parameters: z.object({
    tool: z.string(),
    error: z.string(),
  }),
  async execute(params) {
    return {
      title: "无效工具",
      output: `提供给工具的参数无效：${params.error}`,
      metadata: {},
    }
  },
})
