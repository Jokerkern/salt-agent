import { describe, it, expect, afterEach } from "vitest"
import path from "path"
import os from "os"

// Save original env
const originalEnv = process.env["SALT_DATA_DIR"]

afterEach(() => {
  if (originalEnv !== undefined) {
    process.env["SALT_DATA_DIR"] = originalEnv
  } else {
    delete process.env["SALT_DATA_DIR"]
  }
})

describe("Global.Path", () => {
  it("uses SALT_DATA_DIR when set", async () => {
    process.env["SALT_DATA_DIR"] = "/custom/dir"
    // Re-import to get fresh getter evaluation
    const { Global } = await import("../../src/global/global.js")
    expect(Global.Path.data).toBe("/custom/dir")
  })

  it("defaults to ~/.salt-agent when env not set", async () => {
    delete process.env["SALT_DATA_DIR"]
    const { Global } = await import("../../src/global/global.js")
    expect(Global.Path.data).toBe(path.join(os.homedir(), ".salt-agent"))
  })

  it("storage path is data/storage", async () => {
    process.env["SALT_DATA_DIR"] = "/test/dir"
    const { Global } = await import("../../src/global/global.js")
    expect(Global.Path.storage).toBe(path.join("/test/dir", "storage"))
  })

  it("log path is data/log", async () => {
    process.env["SALT_DATA_DIR"] = "/test/dir"
    const { Global } = await import("../../src/global/global.js")
    expect(Global.Path.log).toBe(path.join("/test/dir", "log"))
  })

  it("config path is data/config", async () => {
    process.env["SALT_DATA_DIR"] = "/test/dir"
    const { Global } = await import("../../src/global/global.js")
    expect(Global.Path.config).toBe(path.join("/test/dir", "config"))
  })

  it("workplace path is data/workplace", async () => {
    process.env["SALT_DATA_DIR"] = "/test/dir"
    const { Global } = await import("../../src/global/global.js")
    expect(Global.Path.workplace).toBe(path.join("/test/dir", "workplace"))
  })

  it("getters are dynamic (change env changes path)", async () => {
    const { Global } = await import("../../src/global/global.js")
    process.env["SALT_DATA_DIR"] = "/path/a"
    const a = Global.Path.data
    process.env["SALT_DATA_DIR"] = "/path/b"
    const b = Global.Path.data
    expect(a).toBe("/path/a")
    expect(b).toBe("/path/b")
  })
})
