import z from "zod"
import { Tool } from "./tool.js"

// TODO: Full implementation requires LSP client integration.
// Operations: goToDefinition, findReferences, hover, documentSymbol,
// workspaceSymbol, goToImplementation, prepareCallHierarchy,
// incomingCalls, outgoingCalls.

const DESCRIPTION = `执行 LSP（语言服务器协议）操作。

用法：
- 提供代码智能：跳转定义、查找引用、悬停信息等
- 需要目标文件语言的 LSP 服务器正在运行

注意：此工具需 LSP 集成。当前为占位实现，LSP 客户端支持可用后将完整实现。`

const operations = [
  "goToDefinition",
  "findReferences",
  "hover",
  "documentSymbol",
  "workspaceSymbol",
  "goToImplementation",
  "prepareCallHierarchy",
  "incomingCalls",
  "outgoingCalls",
] as const

export const LspTool = Tool.define("lsp", {
  description: DESCRIPTION,
  parameters: z.object({
    operation: z.enum(operations).describe("要执行的 LSP 操作"),
    filePath: z
      .string()
      .describe("文件的绝对或相对路径"),
    line: z
      .number()
      .int()
      .min(1)
      .describe("行号（从 1 开始）"),
    character: z
      .number()
      .int()
      .min(1)
      .describe("字符偏移（从 1 开始）"),
  }),
  async execute(_params, _ctx) {
    throw new Error(
      "lsp 工具尚未实现。需 LSP 客户端集成。",
    )
  },
})
