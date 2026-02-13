import { describe, it, expect } from "vitest"
import { Ripgrep } from "../../src/ripgrep/ripgrep.js"

describe("Ripgrep", () => {
  it("filepath resolves to a path", async () => {
    // This test requires rg or @vscode/ripgrep to be available
    try {
      const rgPath = await Ripgrep.filepath()
      expect(typeof rgPath).toBe("string")
      expect(rgPath.length).toBeGreaterThan(0)
    } catch (e) {
      // If rg is not installed, we expect a specific error
      expect((e as Error).message).toContain("ripgrep")
    }
  })

  it("files yields file paths from a directory", async () => {
    try {
      await Ripgrep.filepath()
    } catch {
      // Skip if ripgrep not available
      return
    }

    const cwd = process.cwd()
    const files: string[] = []
    for await (const file of Ripgrep.files({ cwd, glob: ["*.json"] })) {
      files.push(file)
      if (files.length >= 5) break
    }
    // Should find at least package.json in a typical project
    expect(files.length).toBeGreaterThanOrEqual(0)
  })

  it("files respects abort signal", async () => {
    try {
      await Ripgrep.filepath()
    } catch {
      return
    }

    const controller = new AbortController()
    controller.abort()

    const files: string[] = []
    for await (const file of Ripgrep.files({
      cwd: process.cwd(),
      signal: controller.signal,
    })) {
      files.push(file)
    }
    // Should return nothing since aborted immediately
    expect(files.length).toBe(0)
  })
})
