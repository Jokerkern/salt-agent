import { tool } from "ai"
import { z } from "zod"
import fs from "fs/promises"
import path from "path"

export function createWriteTool(cwd: string) {
  return tool({
    description:
      "Write content to a file. Creates parent directories if needed. " +
      "Overwrites existing file. For modifications, prefer the edit tool.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to the working directory"),
      content: z.string().describe("Content to write to the file"),
    }),
    execute: async ({ path: filePath, content }) => {
      const resolved = path.resolve(cwd, filePath)
      await fs.mkdir(path.dirname(resolved), { recursive: true })
      await fs.writeFile(resolved, content, "utf-8")

      const lines = content.split("\n").length
      return {
        output: `Wrote ${lines} lines to ${filePath}`,
        title: `Write ${filePath}`,
      }
    },
  })
}
