import { Type } from "@sinclair/typebox";
import type { AgentTool } from "../agent/types.js";
import fs from "fs/promises";
import path from "path";

export const writeTool: AgentTool = {
  name: "write_file",
  label: "写入文件",
  description: "将内容写入文件。如果文件不存在则创建，如果存在则覆盖。",
  parameters: Type.Object({
    path: Type.String({ description: "要写入的文件路径" }),
    content: Type.String({ description: "要写入的文件内容" }),
  }),
  async execute(_toolCallId, params: any) {
    try {
      const filePath = path.resolve(process.cwd(), params.path);
      const dir = path.dirname(filePath);
      
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, params.content, "utf-8");

      return {
        content: [{ type: "text", text: `文件写入成功: ${params.path}` }],
        details: {
          path: params.path,
          bytes: Buffer.byteLength(params.content, "utf-8"),
        },
      };
    } catch (error) {
      throw new Error(`写入文件失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};
