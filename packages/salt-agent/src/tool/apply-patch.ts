import z from "zod"
import { Tool } from "./tool.js"

const DESCRIPTION = `将 unified diff 补丁应用到一个或多个文件。

用法：
- 提供完整的 unified diff 补丁文本
- 支持添加、修改、删除和移动操作
- 单个补丁可包含多个文件的修改

注意：此工具需 Patch 解析模块。当前为占位实现，Patch 模块可用后将完整实现。`

// TODO: Implement full patch parsing and application.
// This requires porting opencode's Patch module (src/patch/) which handles:
// - parsePatch(text) -> { hunks: Hunk[] }
// - deriveNewContentsFromChunks(filePath, chunks)
// For now, this tool is registered but will throw on use.

export const ApplyPatchTool = Tool.define("apply_patch", {
  description: DESCRIPTION,
  parameters: z.object({
    patchText: z
      .string()
      .describe("描述所有待应用修改的完整补丁文本"),
  }),
  async execute(_params, _ctx) {
    throw new Error(
      "apply_patch 尚未实现。请使用 'edit' 或 'write' 工具。",
    )
  },
})
