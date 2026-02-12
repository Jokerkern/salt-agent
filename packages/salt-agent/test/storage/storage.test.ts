import { describe, it, expect, afterEach } from "vitest"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { Storage } from "../../src/storage/storage.js"

// Use a temp directory for tests
const testDir = path.join(os.tmpdir(), `salt-agent-test-${Date.now()}`)

// Override SALT_DATA_DIR before imports resolve Global.Path
process.env["SALT_DATA_DIR"] = testDir

describe("Storage", () => {
  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  it("write and read", async () => {
    const data = { name: "test", value: 42 }
    await Storage.write(["test", "item1"], data)
    const result = await Storage.read<typeof data>(["test", "item1"])
    expect(result).toEqual(data)
  })

  it("read non-existent key throws NotFoundError", async () => {
    try {
      await Storage.read(["nonexistent", "key"])
      expect.fail("should have thrown")
    } catch (e) {
      expect(Storage.NotFoundError.isInstance(e)).toBe(true)
    }
  })

  it("write creates parent directories", async () => {
    await Storage.write(["deep", "nested", "path", "item"], { ok: true })
    const result = await Storage.read<{ ok: boolean }>(["deep", "nested", "path", "item"])
    expect(result.ok).toBe(true)
  })

  it("update modifies existing data", async () => {
    await Storage.write(["test", "counter"], { count: 0 })
    const result = await Storage.update<{ count: number }>(["test", "counter"], (draft) => {
      draft.count++
    })
    expect(result.count).toBe(1)

    const read = await Storage.read<{ count: number }>(["test", "counter"])
    expect(read.count).toBe(1)
  })

  it("update non-existent key throws NotFoundError", async () => {
    try {
      await Storage.update(["nonexistent"], () => {})
      expect.fail("should have thrown")
    } catch (e) {
      expect(Storage.NotFoundError.isInstance(e)).toBe(true)
    }
  })

  it("remove deletes the file", async () => {
    await Storage.write(["test", "toRemove"], { data: true })
    await Storage.remove(["test", "toRemove"])

    try {
      await Storage.read(["test", "toRemove"])
      expect.fail("should have thrown")
    } catch (e) {
      expect(Storage.NotFoundError.isInstance(e)).toBe(true)
    }
  })

  it("remove non-existent key is silent", async () => {
    await Storage.remove(["nonexistent", "key"])
    // should not throw
  })

  it("list returns all keys under prefix", async () => {
    await Storage.write(["sessions", "s1"], { id: "s1" })
    await Storage.write(["sessions", "s2"], { id: "s2" })
    await Storage.write(["sessions", "s3"], { id: "s3" })
    await Storage.write(["other", "x"], { id: "x" })

    const keys = await Storage.list(["sessions"])
    expect(keys).toHaveLength(3)
    expect(keys.map((k) => k.join("/"))).toEqual([
      "sessions/s1",
      "sessions/s2",
      "sessions/s3",
    ])
  })

  it("list returns nested keys", async () => {
    await Storage.write(["msg", "s1", "m1"], { text: "hello" })
    await Storage.write(["msg", "s1", "m2"], { text: "world" })
    await Storage.write(["msg", "s2", "m3"], { text: "other" })

    const keys = await Storage.list(["msg", "s1"])
    expect(keys).toHaveLength(2)
    expect(keys.map((k) => k.join("/"))).toEqual([
      "msg/s1/m1",
      "msg/s1/m2",
    ])
  })

  it("list returns empty array for non-existent prefix", async () => {
    const keys = await Storage.list(["nonexistent"])
    expect(keys).toEqual([])
  })

  it("list returns sorted results", async () => {
    await Storage.write(["sorted", "c"], {})
    await Storage.write(["sorted", "a"], {})
    await Storage.write(["sorted", "b"], {})

    const keys = await Storage.list(["sorted"])
    expect(keys.map((k) => k[1])).toEqual(["a", "b", "c"])
  })

  it("write overwrites existing data", async () => {
    await Storage.write(["test", "overwrite"], { v: 1 })
    await Storage.write(["test", "overwrite"], { v: 2 })
    const result = await Storage.read<{ v: number }>(["test", "overwrite"])
    expect(result.v).toBe(2)
  })
})
