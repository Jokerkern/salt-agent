import { Type } from "@sinclair/typebox";
import type { AgentTool } from "../agent/types.js";
import fs from "fs/promises";
import path from "path";

export const readTool: AgentTool = {
  name: "read_file",
  label: "读取文件",
  description: "读取文件内容。可以返回完整文件内容或指定行范围的内容。",
  parameters: Type.Object({
    path: Type.String({ description: "要读取的文件路径" }),
    offset: Type.Optional(Type.Number({ description: "开始读取的行号（从1开始）" })),
    limit: Type.Optional(Type.Number({ description: "要读取的行数" })),
  }),
  async execute(_toolCallId, params: any) {
    try {
      const filePath = path.resolve(process.cwd(), params.path);
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");

      let result: string;
      if (params.offset !== undefined || params.limit !== undefined) {
        const start = (params.offset || 1) - 1;
        const end = params.limit ? start + params.limit : lines.length;
        result = lines.slice(start, end).join("\n");
      } else {
        result = content;
      }

      return {
        content: [{ type: "text", text: result }],
        details: {
          path: params.path,
          lines: lines.length,
          read: params.limit || lines.length,
        },
      };
    } catch (error) {
      throw new Error(`读取文件失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};
