import { tool } from "ai"
import { z } from "zod"
import { execSync } from "child_process"

export function createGrepTool(cwd: string) {
  return tool({
    description:
      "Search file contents using ripgrep (rg). Supports regex patterns. " +
      "Returns matching lines with file paths and line numbers.",
    inputSchema: z.object({
      pattern: z.string().describe("Search pattern (regex supported)"),
      path: z.string().optional().default(".").describe("Directory or file to search in (default: current directory)"),
      include: z.string().optional().describe('Glob pattern to filter files (e.g. "*.ts", "*.py")'),
      ignore_case: z.boolean().optional().default(false).describe("Case-insensitive search"),
      max_count: z.number().int().min(1).optional().default(50).describe("Max results to return (default 50)"),
    }),
    execute: async ({ pattern, path: searchPath, include, ignore_case, max_count }) => {
      const args = ["rg", "--line-number", "--no-heading", "--color=never"]

      if (ignore_case) args.push("-i")
      if (max_count) args.push("-m", String(max_count))
      if (include) args.push("--glob", include)

      args.push("--", pattern, searchPath)

      try {
        const output = execSync(args.join(" "), {
          cwd,
          encoding: "utf-8",
          maxBuffer: 5 * 1024 * 1024,
          timeout: 30_000,
          shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
        })

        const lines = output.trim().split("\n")
        return {
          output: output.trim() || "(no matches)",
          title: `grep: "${pattern}" (${lines.length} matches)`,
        }
      } catch (err: unknown) {
        const e = err as { status?: number }
        if (e.status === 1) {
          return { output: "(no matches)", title: `grep: "${pattern}" (0 matches)` }
        }
        return { output: `Grep error: ${(err as Error).message}`, title: `grep: "${pattern}" (error)` }
      }
    },
  })
}
