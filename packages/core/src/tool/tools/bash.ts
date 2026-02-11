import { tool } from "ai"
import { z } from "zod"
import { execSync } from "child_process"

const MAX_OUTPUT = 50_000

export function createBashTool(cwd: string) {
  return tool({
    description:
      "Execute a bash command in the working directory. " +
      "Use for running scripts, git operations, package management, etc. " +
      "Commands run synchronously with a 60-second timeout.",
    inputSchema: z.object({
      command: z.string().describe("The bash command to execute"),
      timeout: z.number().int().min(1000).max(300_000).optional().default(60_000).describe("Timeout in ms (default 60000)"),
    }),
    execute: async ({ command, timeout }) => {
      try {
        const output = execSync(command, {
          cwd,
          timeout,
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
          stdio: ["pipe", "pipe", "pipe"],
          shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
        })

        const trimmed = output.length > MAX_OUTPUT ? output.slice(0, MAX_OUTPUT) + "\n... (truncated)" : output

        return {
          output: trimmed || "(no output)",
          title: `bash: ${command.length > 60 ? command.slice(0, 57) + "..." : command}`,
        }
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; status?: number; message?: string }
        const stdout = e.stdout || ""
        const stderr = e.stderr || ""
        const combined = [stdout, stderr].filter(Boolean).join("\n")
        const trimmed = combined.length > MAX_OUTPUT ? combined.slice(0, MAX_OUTPUT) + "\n... (truncated)" : combined

        return {
          output: trimmed || e.message || "Command failed",
          title: `bash: ${command.length > 60 ? command.slice(0, 57) + "..." : command} (exit ${e.status ?? "?"})`,
        }
      }
    },
  })
}
