import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { Log } from "../../src/util/log.js"

const testDir = path.join(os.tmpdir(), `salt-agent-log-test-${Date.now()}`)

// Override data dir for log file tests
process.env["SALT_DATA_DIR"] = testDir

describe("Log", () => {
  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  it("create returns a logger with all methods", () => {
    const log = Log.create({ service: "test" })
    expect(typeof log.info).toBe("function")
    expect(typeof log.debug).toBe("function")
    expect(typeof log.warn).toBe("function")
    expect(typeof log.error).toBe("function")
    expect(typeof log.tag).toBe("function")
    expect(typeof log.clone).toBe("function")
    expect(typeof log.time).toBe("function")
  })

  it("create caches loggers by service name", () => {
    const log1 = Log.create({ service: "cached-svc" })
    const log2 = Log.create({ service: "cached-svc" })
    expect(log1).toBe(log2)
  })

  it("create returns different loggers for different services", () => {
    const log1 = Log.create({ service: "svc-a" })
    const log2 = Log.create({ service: "svc-b" })
    expect(log1).not.toBe(log2)
  })

  it("tag mutates and returns the same logger", () => {
    const log = Log.create({ service: "tag-test" })
    const result = log.tag("key", "value")
    expect(result).toBe(log)
  })

  it("clone returns a new logger instance", () => {
    const log = Log.create({ service: "clone-src" })
    const cloned = log.clone()
    expect(cloned).not.toBe(log)
  })

  it("time returns an object with stop and Symbol.dispose", () => {
    const log = Log.create({ service: "time-test" })
    const timer = log.time("operation")
    expect(typeof timer.stop).toBe("function")
    expect(typeof timer[Symbol.dispose]).toBe("function")
    timer.stop()
  })

  it("Default logger exists", () => {
    expect(Log.Default).toBeDefined()
    expect(typeof Log.Default.info).toBe("function")
  })

  it("init with print mode does not create a log file", async () => {
    await Log.init({ print: true })
    expect(Log.file()).toBe("")
  })

  it("init with dev mode creates a dev.log file", async () => {
    await Log.init({ print: false, dev: true })
    const logFile = Log.file()
    expect(logFile).toContain("dev.log")

    // Write something to trigger file creation
    const log = Log.create({ service: "init-test" })
    log.info("test message")

    // Give a tick for the write to flush
    await new Promise((r) => setTimeout(r, 50))

    const content = await fs.readFile(logFile, "utf-8")
    expect(content).toContain("INFO")
    expect(content).toContain("test message")
  })

  it("init respects level setting", async () => {
    await Log.init({ print: false, dev: true, level: "ERROR" })
    const logFile = Log.file()

    const log = Log.create({ service: "level-test" })
    log.info("should be filtered")
    log.error("should appear")

    await new Promise((r) => setTimeout(r, 50))

    const content = await fs.readFile(logFile, "utf-8")
    expect(content).not.toContain("should be filtered")
    expect(content).toContain("should appear")
  })

  it("log output includes service tag and message", async () => {
    await Log.init({ print: false, dev: true, level: "DEBUG" })
    const logFile = Log.file()

    const log = Log.create({ service: "format-test" })
    log.info("hello world", { extra: "data" })

    await new Promise((r) => setTimeout(r, 50))

    const content = await fs.readFile(logFile, "utf-8")
    expect(content).toContain("service=format-test")
    expect(content).toContain("extra=data")
    expect(content).toContain("hello world")
  })
})
