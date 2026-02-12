import { tool } from "ai"
import { z } from "zod"
import { execSync } from "child_process"

export function createGlobTool(cwd: string) {
  return tool({
    description:
      "Find files matching a glob pattern. Returns file paths sorted by modification time. " +
      "Uses rg --files with glob patterns for fast searching.",
    inputSchema: z.object({
      pattern: z.string().describe('Glob pattern to match files (e.g. "**/*.ts", "src/**/*.tsx")'),
      path: z.string().optional().default(".").describe("Directory to search in (default: current directory)"),
    }),
    execute: async ({ pattern, path: searchPath }) => {
      try {
        const output = execSync(`rg --files --glob "${pattern}" ${searchPath}`, {
          cwd,
          encoding: "utf-8",
          maxBuffer: 5 * 1024 * 1024,
          timeout: 30_000,
          shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
        })

        const files = output.trim().split("\n").filter(Boolean)
        return {
          output: files.join("\n") || "(no files found)",
          title: `glob: "${pattern}" (${files.length} files)`,
        }
      } catch (err: unknown) {
        const e = err as { status?: number }
        if (e.status === 1) {
          return { output: "(no files found)", title: `glob: "${pattern}" (0 files)` }
        }
        return { output: `Glob error: ${(err as Error).message}`, title: `glob: "${pattern}" (error)` }
      }
    },
  })
}
