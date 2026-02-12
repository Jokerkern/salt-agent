import { spawn, execSync } from "child_process"
import path from "path"

/**
 * Ripgrep binary resolution and helpers for grep/glob/ls tools.
 */
export namespace Ripgrep {
  let _path: string | undefined

  export async function filepath(): Promise<string> {
    if (_path) return _path

    // Try @vscode/ripgrep first (optional dependency)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = await import(/* webpackIgnore: true */ "@vscode/ripgrep" as string)
      _path = (mod as Record<string, any>).rgPath as string | undefined
      if (_path) return _path
    } catch {}

    // Fall back to rg in PATH
    try {
      const cmd = process.platform === "win32" ? "where rg" : "which rg"
      const result = execSync(cmd, { encoding: "utf-8" })
      _path = result.trim().split("\n")[0]!.trim()
      return _path
    } catch {}

    throw new Error(
      "ripgrep (rg) not found. Install via: npm install @vscode/ripgrep, or install rg system-wide.",
    )
  }

  /**
   * List files using ripgrep's --files mode.
   * Yields relative file paths from `cwd`.
   */
  export async function* files(options: {
    cwd: string
    glob?: string[]
    follow?: boolean
    hidden?: boolean
    signal?: AbortSignal
  }): AsyncGenerator<string> {
    const rg = await filepath()
    const args = ["--files"]
    if (options.hidden !== false) args.push("--hidden")
    if (options.follow) args.push("--follow")
    for (const g of options.glob ?? []) {
      args.push("--glob", g)
    }

    const proc = spawn(rg, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    })

    if (options.signal) {
      if (options.signal.aborted) {
        proc.kill()
        return
      }
      options.signal.addEventListener("abort", () => proc.kill(), { once: true })
    }

    let buffer = ""
    for await (const chunk of proc.stdout!) {
      buffer += chunk.toString()
      const lines = buffer.split("\n")
      buffer = lines.pop()!
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed) {
          // Normalize path separators
          yield trimmed.split(path.win32.sep).join(path.posix.sep)
        }
      }
    }
    if (buffer.trim()) {
      yield buffer.trim().split(path.win32.sep).join(path.posix.sep)
    }

    // Wait for process to exit
    await new Promise<void>((resolve) => {
      proc.on("exit", resolve)
      proc.on("error", resolve)
    })
  }
}
