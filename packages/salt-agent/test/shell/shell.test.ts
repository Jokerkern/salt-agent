import { describe, it, expect } from "vitest"
import { Shell } from "../../src/shell/shell.js"

describe("Shell", () => {
  it("acceptable returns a string", () => {
    const shell = Shell.acceptable()
    expect(typeof shell).toBe("string")
    expect(shell.length).toBeGreaterThan(0)
  })

  it("acceptable returns a known shell", () => {
    const shell = Shell.acceptable()
    const known = [
      "/bin/bash",
      "/usr/bin/bash",
      "/bin/zsh",
      "/bin/sh",
      "powershell.exe",
      "cmd.exe",
    ]
    expect(known).toContain(shell)
  })

  it("killTree handles undefined pid gracefully", async () => {
    const mockProc = { pid: undefined } as any
    // Should not throw
    await Shell.killTree(mockProc)
  })

  it("killTree respects exited callback", async () => {
    const mockProc = { pid: 99999 } as any
    // If already exited, should return immediately
    await Shell.killTree(mockProc, { exited: () => true })
  })
})
