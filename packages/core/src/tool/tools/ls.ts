import { tool } from "ai"
import { z } from "zod"
import fs from "fs/promises"
import path from "path"

export function createLsTool(cwd: string) {
  return tool({
    description:
      "List files and directories in a given path. " +
      "Returns entries with type indicators (file/directory).",
    inputSchema: z.object({
      path: z.string().optional().default(".").describe("Directory path relative to the working directory"),
    }),
    execute: async ({ path: dirPath }) => {
      const resolved = path.resolve(cwd, dirPath)

      try {
        const entries = await fs.readdir(resolved, { withFileTypes: true })
        const lines = entries
          .filter((e) => !e.name.startsWith("."))
          .sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1
            if (!a.isDirectory() && b.isDirectory()) return 1
            return a.name.localeCompare(b.name)
          })
          .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))

        return {
          output: lines.join("\n") || "(empty directory)",
          title: `ls ${dirPath} (${lines.length} entries)`,
        }
      } catch {
        return {
          output: `Error: cannot read directory ${dirPath}`,
          title: `ls ${dirPath} (error)`,
        }
      }
    },
  })
}
