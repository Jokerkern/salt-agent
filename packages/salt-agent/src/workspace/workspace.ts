import path from "path"

/**
 * Workspace manages the current project directory.
 * Replaces opencode's Instance for salt-agent's single-project design.
 */
export namespace Workspace {
  export let directory: string = process.cwd()
  export let worktree: string = process.cwd()

  export function setDirectory(dir: string) {
    directory = path.resolve(dir)
    worktree = directory
  }

  export function setWorktree(dir: string) {
    worktree = path.resolve(dir)
  }

  export function containsPath(filepath: string): boolean {
    const resolved = path.resolve(filepath)
    const dir = path.resolve(directory)
    // Normalize for case-insensitive file systems (Windows)
    if (process.platform === "win32") {
      return (
        resolved.toLowerCase().startsWith(dir.toLowerCase() + path.sep) ||
        resolved.toLowerCase() === dir.toLowerCase()
      )
    }
    return resolved.startsWith(dir + path.sep) || resolved === dir
  }
}
