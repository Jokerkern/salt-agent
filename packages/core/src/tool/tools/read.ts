import { tool } from "ai"
import { z } from "zod"
import fs from "fs/promises"
import path from "path"

export function createReadTool(cwd: string) {
  return tool({
    description:
      "Read the contents of a file. Returns the file content with line numbers. " +
      "Use offset and limit to read specific ranges of large files.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to the working directory"),
      offset: z.number().int().min(0).optional().describe("Starting line number (0-based). Omit to start from beginning."),
      limit: z.number().int().min(1).optional().describe("Number of lines to read. Omit to read entire file."),
    }),
    execute: async ({ path: filePath, offset, limit }) => {
      const resolved = path.resolve(cwd, filePath)
      const content = await fs.readFile(resolved, "utf-8")
      const lines = content.split("\n")

      const start = offset ?? 0
      const end = limit ? start + limit : lines.length
      const slice = lines.slice(start, end)

      const numbered = slice.map((line, i) => `${String(start + i + 1).padStart(6)}|${line}`).join("\n")

      return {
        output: numbered,
        title: `Read ${filePath} (${lines.length} lines${offset ? `, from line ${start + 1}` : ""}${limit ? `, ${limit} lines` : ""})`,
      }
    },
  })
}
