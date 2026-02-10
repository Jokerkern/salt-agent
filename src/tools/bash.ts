import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const bashTool: AgentTool = {
  name: "bash",
  label: "执行命令",
  description: "在当前工作目录执行命令。返回标准输出和标准错误。",
  parameters: Type.Object({
    command: Type.String({ description: "要执行的命令" }),
  }),
  async execute(_toolCallId, params: any, signal?: AbortSignal) {
    try {
      const { stdout, stderr } = await execAsync(params.command, {
        cwd: process.cwd(),
        signal,
        maxBuffer: 1024 * 1024 * 10, // 10MB
      });

      const output = [stdout, stderr].filter(Boolean).join("\n\n");

      return {
        content: [{ type: "text", text: output || "(无输出)" }],
        details: {
          command: params.command,
          exitCode: 0,
        },
      };
    } catch (error: any) {
      const output = [error.stdout, error.stderr].filter(Boolean).join("\n\n");
      throw new Error(`命令执行失败 (退出码 ${error.code || "未知"}):\n${output}`);
    }
  },
};
