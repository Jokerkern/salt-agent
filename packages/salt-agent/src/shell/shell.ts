import fs from "fs"
import path from "path"
import { spawn, spawnSync, type ChildProcess } from "child_process"

const SIGKILL_TIMEOUT_MS = 200

export namespace Shell {
  export interface ShellInfo {
    /** Tool ID used for registration, e.g. "bash", "powershell" */
    id: string
    /** Human-readable name for LLM prompts, e.g. "bash", "PowerShell" */
    name: string
    /** Absolute path to the shell executable */
    path: string
  }

  /**
   * Detect all available shells on the system.
   * Returns one entry per shell type (deduped).
   */
  export function detect(): ShellInfo[] {
    const found: ShellInfo[] = []
    const seen = new Set<string>()

    function add(id: string, name: string, shellPath: string) {
      if (seen.has(id)) return
      seen.add(id)
      found.push({ id, name, path: shellPath })
    }

    if (process.platform === "win32") {
      // PowerShell
      for (const ps of ["powershell.exe", "pwsh.exe"]) {
        try {
          const result = spawnSync("where", [ps], { encoding: "utf-8", timeout: 5000 })
          if (result.status === 0 && result.stdout) {
            const first = result.stdout.trim().split(/\r?\n/)[0]
            if (first && fs.existsSync(first)) {
              add("powershell", "PowerShell", first)
              break
            }
          }
        } catch {}
      }
      // cmd
      const comspec = process.env.COMSPEC || "C:\\Windows\\System32\\cmd.exe"
      if (fs.existsSync(comspec)) {
        add("cmd", "cmd", comspec)
      }
      // Git Bash
      const programFiles = process.env.ProgramFiles
      if (programFiles) {
        const gitBash = path.join(programFiles, "Git", "bin", "bash.exe")
        if (fs.existsSync(gitBash)) {
          add("bash", "bash", gitBash)
        }
      }
      // bash on PATH (Cygwin, MSYS2, WSL, etc.) — only if not already found
      if (!seen.has("bash")) {
        try {
          const result = spawnSync("where", ["bash.exe"], { encoding: "utf-8", timeout: 5000 })
          if (result.status === 0 && result.stdout) {
            const first = result.stdout.trim().split(/\r?\n/)[0]
            if (first && fs.existsSync(first)) {
              add("bash", "bash", first)
            }
          }
        } catch {}
      }
    } else {
      // Unix / macOS
      if (process.platform === "darwin") {
        if (fs.existsSync("/bin/zsh")) add("zsh", "zsh", "/bin/zsh")
      }
      if (fs.existsSync("/bin/bash")) {
        add("bash", "bash", "/bin/bash")
      } else {
        try {
          const result = spawnSync("which", ["bash"], { encoding: "utf-8", timeout: 5000 })
          if (result.status === 0 && result.stdout) {
            const first = result.stdout.trim().split(/\r?\n/)[0]
            if (first) add("bash", "bash", first)
          }
        } catch {}
      }
      if (fs.existsSync("/bin/sh") && !seen.has("bash") && !seen.has("zsh")) {
        add("sh", "sh", "/bin/sh")
      }
    }

    return found
  }

  /** Cache */
  let _detected: ShellInfo[] | undefined

  /** Get all detected shells (cached after first call) */
  export function available(): ShellInfo[] {
    if (!_detected) _detected = detect()
    return _detected
  }

  /** Get the primary (first detected) shell */
  export function primary(): ShellInfo {
    const shells = available()
    if (shells.length === 0) {
      return { id: "sh", name: "sh", path: process.platform === "win32" ? "cmd.exe" : "/bin/sh" }
    }
    return shells[0]!
  }

  export async function killTree(
    proc: ChildProcess,
    options?: { exited?: () => boolean },
  ) {
    const pid = proc.pid
    if (!pid || options?.exited?.()) return

    if (process.platform === "win32") {
      await new Promise<void>((resolve) => {
        const killer = spawn("taskkill", ["/pid", String(pid), "/f", "/t"], { stdio: "ignore" })
        killer.once("exit", () => resolve())
        killer.once("error", () => resolve())
      })
      return
    }

    try {
      process.kill(-pid, "SIGTERM")
    } catch {
      proc.kill("SIGTERM")
    }

    await new Promise((resolve) => setTimeout(resolve, SIGKILL_TIMEOUT_MS))
    if (!options?.exited?.()) {
      try {
        process.kill(-pid, "SIGKILL")
      } catch {
        proc.kill("SIGKILL")
      }
    }
  }
}
