import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { Truncate } from "../../src/tool/truncation.js"
import { Storage } from "../../src/storage/storage.js"

const testDir = path.join(os.tmpdir(), `salt-truncation-test-${Date.now()}`)
process.env["SALT_DATA_DIR"] = testDir

async function cleanup() {
  await fs.rm(testDir, { recursive: true, force: true })
  Storage.reset()
}

describe("Truncate.output", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("returns content unchanged when under limits", async () => {
    const text = "line 1\nline 2\nline 3"
    const result = await Truncate.output(text)
    expect(result.truncated).toBe(false)
    expect(result.content).toBe(text)
  })

  it("truncates when over MAX_LINES", async () => {
    const lines = Array.from({ length: 3000 }, (_, i) => `line ${i}`)
    const text = lines.join("\n")
    const result = await Truncate.output(text)
    expect(result.truncated).toBe(true)
    if (result.truncated) {
      expect(result.outputPath).toBeDefined()
      // Verify the full output was saved to disk
      const saved = await fs.readFile(result.outputPath, "utf-8")
      expect(saved).toBe(text)
    }
  })

  it("truncates when over MAX_BYTES", async () => {
    // Create content that's small in lines but large in bytes
    const bigLine = "x".repeat(60 * 1024) // 60KB > MAX_BYTES (50KB)
    const result = await Truncate.output(bigLine)
    expect(result.truncated).toBe(true)
  })

  it("respects custom maxLines option", async () => {
    const text = "a\nb\nc\nd\ne"
    const result = await Truncate.output(text, { maxLines: 3 })
    expect(result.truncated).toBe(true)
    if (result.truncated) {
      expect(result.content).toContain("a\nb\nc")
    }
  })

  it("respects custom maxBytes option", async () => {
    const text = "x".repeat(200)
    const result = await Truncate.output(text, { maxBytes: 100 })
    expect(result.truncated).toBe(true)
  })

  it("direction tail keeps last lines", async () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`)
    const text = lines.join("\n")
    const result = await Truncate.output(text, { maxLines: 5, direction: "tail" })
    expect(result.truncated).toBe(true)
    expect(result.content).toContain("line 99")
    expect(result.content).toContain("line 95")
  })

  it("direction head keeps first lines (default)", async () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`)
    const text = lines.join("\n")
    const result = await Truncate.output(text, { maxLines: 5 })
    expect(result.truncated).toBe(true)
    expect(result.content).toContain("line 0")
    expect(result.content).toContain("line 4")
  })

  it("empty string is not truncated", async () => {
    const result = await Truncate.output("")
    expect(result.truncated).toBe(false)
    expect(result.content).toBe("")
  })

  it("single line within limits is not truncated", async () => {
    const result = await Truncate.output("hello world")
    expect(result.truncated).toBe(false)
    expect(result.content).toBe("hello world")
  })
})

describe("Truncate constants", () => {
  it("MAX_LINES is 2000", () => {
    expect(Truncate.MAX_LINES).toBe(2000)
  })

  it("MAX_BYTES is 50KB", () => {
    expect(Truncate.MAX_BYTES).toBe(50 * 1024)
  })

  it("DIR contains tool-output", () => {
    expect(Truncate.DIR).toContain("tool-output")
  })

  it("GLOB contains tool-output with wildcard", () => {
    expect(Truncate.GLOB).toContain("tool-output")
    expect(Truncate.GLOB).toContain("*")
  })
})

describe("Truncate.cleanup", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("does not throw when DIR does not exist", async () => {
    await expect(Truncate.cleanup()).resolves.not.toThrow()
  })
})
