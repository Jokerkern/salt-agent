import type { ToolSet } from "ai"
import { createReadTool } from "./read.js"
import { createWriteTool } from "./write.js"
import { createEditTool } from "./edit.js"
import { createBashTool } from "./bash.js"
import { createGrepTool } from "./grep.js"
import { createGlobTool } from "./glob.js"
import { createLsTool } from "./ls.js"

/**
 * Create the full set of built-in tools for the given working directory.
 */
export function createAllTools(cwd: string): ToolSet {
  return {
    read: createReadTool(cwd),
    write: createWriteTool(cwd),
    edit: createEditTool(cwd),
    bash: createBashTool(cwd),
    grep: createGrepTool(cwd),
    glob: createGlobTool(cwd),
    ls: createLsTool(cwd),
  }
}

/**
 * Filter tools based on agent permission rules.
 * Permission map: { "*": "allow"|"deny", "toolName": "allow"|"deny" }
 * Specific tool rules override the wildcard.
 */
export function filterTools(
  tools: ToolSet,
  permission: Record<string, "allow" | "deny">,
): ToolSet {
  const wildcard = permission["*"] ?? "allow"
  const result: ToolSet = {}

  for (const [name, tool] of Object.entries(tools)) {
    const rule = permission[name] ?? wildcard
    if (rule === "allow") {
      result[name] = tool
    }
  }

  return result
}

export {
  createReadTool,
  createWriteTool,
  createEditTool,
  createBashTool,
  createGrepTool,
  createGlobTool,
  createLsTool,
}
