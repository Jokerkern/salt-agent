import fs from "fs"
import { execSync, type ChildProcess } from "child_process"

/**
 * Shell utilities: find acceptable shell, kill process trees.
 */
export namespace Shell {
  export function acceptable(): string {
    if (process.platform === "win32") {
      // Prefer PowerShell, fall back to cmd
      for (const shell of ["powershell.exe", "cmd.exe"]) {
        try {
          execSync(`where ${shell}`, { stdio: "ignore" })
          return shell
        } catch {}
      }
      return "cmd.exe"
    }

    for (const shell of ["/bin/bash", "/usr/bin/bash", "/bin/zsh", "/bin/sh"]) {
      try {
        fs.accessSync(shell)
        return shell
      } catch {}
    }
    return "/bin/sh"
  }

  export async function killTree(
    proc: ChildProcess,
    options?: { exited?: () => boolean },
  ) {
    if (options?.exited?.()) return
    if (proc.pid === undefined) return

    if (process.platform === "win32") {
      try {
        execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: "ignore" })
      } catch {}
      return
    }

    // Unix: send SIGTERM to process group
    try {
      process.kill(-proc.pid, "SIGTERM")
    } catch {}

    // Wait a moment, then SIGKILL if still alive
    await new Promise((resolve) => setTimeout(resolve, 1000))
    if (!options?.exited?.()) {
      try {
        process.kill(-proc.pid, "SIGKILL")
      } catch {}
    }
  }
}
