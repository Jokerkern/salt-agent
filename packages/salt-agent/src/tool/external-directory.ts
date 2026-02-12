import path from "path"
import type { Tool } from "./tool.js"
import { Workspace } from "../workspace/workspace.js"

type Kind = "file" | "directory"

type Options = {
  bypass?: boolean
  kind?: Kind
}

/**
 * Asserts that accessing a path outside the workspace directory
 * has been approved via the permission system.
 */
export async function assertExternalDirectory(
  ctx: Tool.Context,
  target?: string,
  options?: Options,
) {
  if (!target) return
  if (options?.bypass) return
  if (Workspace.containsPath(target)) return

  const kind = options?.kind ?? "file"
  const parentDir = kind === "directory" ? target : path.dirname(target)
  const glob = path.join(parentDir, "*")

  await ctx.ask({
    permission: "external_directory",
    patterns: [glob],
    always: [glob],
    metadata: {
      filepath: target,
      parentDir,
    },
  })
}
