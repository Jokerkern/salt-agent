import { tool } from "ai"
import { z } from "zod"
import fs from "fs/promises"
import path from "path"

export function createEditTool(cwd: string) {
  return tool({
    description:
      "Edit a file by replacing an exact string match with new content. " +
      "The old_string must match exactly (including whitespace and indentation). " +
      "Use replace_all=true to replace all occurrences.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to the working directory"),
      old_string: z.string().describe("Exact string to find and replace"),
      new_string: z.string().describe("Replacement string"),
      replace_all: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, replace all occurrences. Default: false (replace first only)"),
    }),
    execute: async ({ path: filePath, old_string, new_string, replace_all }) => {
      const resolved = path.resolve(cwd, filePath)
      const content = await fs.readFile(resolved, "utf-8")

      if (!content.includes(old_string)) {
        return {
          output: `Error: old_string not found in ${filePath}. Make sure it matches exactly (including whitespace).`,
          title: `Edit ${filePath} (failed)`,
        }
      }

      const count = content.split(old_string).length - 1

      let updated: string
      if (replace_all) {
        updated = content.replaceAll(old_string, new_string)
      } else {
        if (count > 1) {
          return {
            output: `Error: old_string has ${count} occurrences in ${filePath}. Use replace_all=true to replace all, or provide more context to make it unique.`,
            title: `Edit ${filePath} (failed)`,
          }
        }
        updated = content.replace(old_string, new_string)
      }

      await fs.writeFile(resolved, updated, "utf-8")

      const replaced = replace_all ? count : 1
      return {
        output: `Replaced ${replaced} occurrence(s) in ${filePath}`,
        title: `Edit ${filePath}`,
      }
    },
  })
}
