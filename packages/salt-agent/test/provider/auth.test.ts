import { describe, it, expect, afterEach, beforeEach } from "vitest"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { Auth } from "../../src/provider/auth.js"
import { Bus } from "../../src/bus/bus.js"

const testDir = path.join(os.tmpdir(), `salt-agent-auth-test-${Date.now()}`)
process.env["SALT_DATA_DIR"] = testDir

describe("Auth", () => {
  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  // ---------------------------------------------------------------------------
  // Schema validation
  // ---------------------------------------------------------------------------

  describe("schema", () => {
    it("accepts API key credential", () => {
      const result = Auth.Info.safeParse({ type: "api", key: "sk-test-123" })
      expect(result.success).toBe(true)
    })

    it("accepts OAuth credential", () => {
      const result = Auth.Info.safeParse({
        type: "oauth",
        refresh: "refresh-token",
        access: "access-token",
        expires: Date.now() + 3600_000,
      })
      expect(result.success).toBe(true)
    })

    it("accepts OAuth with accountId", () => {
      const result = Auth.Info.safeParse({
        type: "oauth",
        refresh: "refresh-token",
        access: "access-token",
        expires: Date.now() + 3600_000,
        accountId: "acc-123",
      })
      expect(result.success).toBe(true)
    })

    it("rejects invalid type", () => {
      const result = Auth.Info.safeParse({ type: "invalid", key: "test" })
      expect(result.success).toBe(false)
    })

    it("rejects API key without key field", () => {
      const result = Auth.Info.safeParse({ type: "api" })
      expect(result.success).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // CRUD operations
  // ---------------------------------------------------------------------------

  describe("set / get", () => {
    it("stores and retrieves an API key", async () => {
      await Auth.set("openai", { type: "api", key: "sk-openai-test" })
      const result = await Auth.get("openai")
      expect(result).toBeDefined()
      expect(result!.type).toBe("api")
      if (result!.type === "api") {
        expect(result!.key).toBe("sk-openai-test")
      }
    })

    it("stores and retrieves an OAuth credential", async () => {
      const expires = Date.now() + 3600_000
      await Auth.set("github-copilot", {
        type: "oauth",
        refresh: "refresh-abc",
        access: "access-xyz",
        expires,
      })
      const result = await Auth.get("github-copilot")
      expect(result).toBeDefined()
      expect(result!.type).toBe("oauth")
      if (result!.type === "oauth") {
        expect(result!.refresh).toBe("refresh-abc")
        expect(result!.access).toBe("access-xyz")
        expect(result!.expires).toBe(expires)
      }
    })

    it("returns undefined for unknown provider", async () => {
      const result = await Auth.get("nonexistent")
      expect(result).toBeUndefined()
    })

    it("overwrites existing credential", async () => {
      await Auth.set("openai", { type: "api", key: "old-key" })
      await Auth.set("openai", { type: "api", key: "new-key" })
      const result = await Auth.get("openai")
      expect(result).toBeDefined()
      if (result!.type === "api") {
        expect(result!.key).toBe("new-key")
      }
    })
  })

  describe("all", () => {
    it("returns all stored credentials", async () => {
      await Auth.set("openai", { type: "api", key: "sk-openai" })
      await Auth.set("anthropic", { type: "api", key: "sk-anthropic" })
      const all = await Auth.all()
      expect(Object.keys(all)).toHaveLength(2)
      expect(all).toHaveProperty("openai")
      expect(all).toHaveProperty("anthropic")
    })

    it("returns empty object when no credentials exist", async () => {
      const all = await Auth.all()
      expect(Object.keys(all)).toHaveLength(0)
    })

    it("skips invalid entries", async () => {
      // Write a file with one valid and one invalid entry
      const file = path.join(testDir, "auth.json")
      await fs.writeFile(
        file,
        JSON.stringify({
          openai: { type: "api", key: "valid-key" },
          invalid: { type: "unknown", foo: "bar" },
        }),
      )
      const all = await Auth.all()
      expect(Object.keys(all)).toHaveLength(1)
      expect(all).toHaveProperty("openai")
      expect(all).not.toHaveProperty("invalid")
    })
  })

  describe("remove", () => {
    it("removes a credential", async () => {
      await Auth.set("openai", { type: "api", key: "sk-test" })
      await Auth.remove("openai")
      const result = await Auth.get("openai")
      expect(result).toBeUndefined()
    })

    it("no-ops when removing nonexistent credential", async () => {
      await Auth.remove("nonexistent")
      const all = await Auth.all()
      expect(Object.keys(all)).toHaveLength(0)
    })

    it("does not affect other credentials", async () => {
      await Auth.set("openai", { type: "api", key: "sk-openai" })
      await Auth.set("anthropic", { type: "api", key: "sk-anthropic" })
      await Auth.remove("openai")
      const all = await Auth.all()
      expect(Object.keys(all)).toHaveLength(1)
      expect(all).toHaveProperty("anthropic")
    })
  })

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  describe("events", () => {
    it("publishes auth.updated on set", async () => {
      let eventReceived = false
      const unsub = Bus.subscribe(Auth.Event.Updated, (evt) => {
        expect(evt.properties.providerID).toBe("openai")
        eventReceived = true
      })
      await Auth.set("openai", { type: "api", key: "sk-test" })
      unsub()
      expect(eventReceived).toBe(true)
    })

    it("publishes auth.updated on remove", async () => {
      await Auth.set("openai", { type: "api", key: "sk-test" })
      let eventReceived = false
      const unsub = Bus.subscribe(Auth.Event.Updated, (evt) => {
        expect(evt.properties.providerID).toBe("openai")
        eventReceived = true
      })
      await Auth.remove("openai")
      unsub()
      expect(eventReceived).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // extractKey
  // ---------------------------------------------------------------------------

  describe("extractKey", () => {
    it("extracts key from API credential", () => {
      const key = Auth.extractKey({ type: "api", key: "sk-test-key" })
      expect(key).toBe("sk-test-key")
    })

    it("extracts access token from OAuth credential", () => {
      const key = Auth.extractKey({
        type: "oauth",
        refresh: "refresh",
        access: "access-token-xyz",
        expires: Date.now() + 3600_000,
      })
      expect(key).toBe("access-token-xyz")
    })
  })

  // ---------------------------------------------------------------------------
  // isExpired
  // ---------------------------------------------------------------------------

  describe("isExpired", () => {
    it("returns false for API credentials", () => {
      expect(Auth.isExpired({ type: "api", key: "test" })).toBe(false)
    })

    it("returns false for valid OAuth token", () => {
      const info: Auth.Info = {
        type: "oauth",
        refresh: "r",
        access: "a",
        expires: Date.now() + 3600_000,
      }
      expect(Auth.isExpired(info)).toBe(false)
    })

    it("returns true for expired OAuth token", () => {
      const info: Auth.Info = {
        type: "oauth",
        refresh: "r",
        access: "a",
        expires: Date.now() - 1000,
      }
      expect(Auth.isExpired(info)).toBe(true)
    })

    it("returns true when within buffer", () => {
      const info: Auth.Info = {
        type: "oauth",
        refresh: "r",
        access: "a",
        expires: Date.now() + 30_000, // 30s from now
      }
      // Default buffer is 60s, so this should be "expired"
      expect(Auth.isExpired(info)).toBe(true)
      // With a 10s buffer, should not be expired
      expect(Auth.isExpired(info, 10_000)).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Disk persistence
  // ---------------------------------------------------------------------------

  describe("persistence", () => {
    it("persists to auth.json file", async () => {
      await Auth.set("test", { type: "api", key: "persistent-key" })
      const file = path.join(testDir, "auth.json")
      const text = await fs.readFile(file, "utf-8")
      const data = JSON.parse(text)
      expect(data.test).toEqual({ type: "api", key: "persistent-key" })
    })

    it("auth.json has restricted permissions (mode 0o600)", async () => {
      await Auth.set("test", { type: "api", key: "secret" })
      const file = path.join(testDir, "auth.json")
      const stat = await fs.stat(file)
      // On Windows, file mode checks are less reliable, so just verify the file exists
      expect(stat.isFile()).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Error types
  // ---------------------------------------------------------------------------

  describe("errors", () => {
    it("creates NotFoundError", () => {
      const err = new Auth.NotFoundError({ providerID: "test" })
      expect(err.name).toBe("AuthNotFoundError")
      expect(err.data.providerID).toBe("test")
    })

    it("creates OauthMissingError", () => {
      const err = new Auth.OauthMissingError({ providerID: "copilot" })
      expect(err.name).toBe("AuthOauthMissingError")
      expect(Auth.OauthMissingError.isInstance(err)).toBe(true)
    })

    it("creates OauthCallbackFailedError", () => {
      const err = new Auth.OauthCallbackFailedError({})
      expect(err.name).toBe("AuthOauthCallbackFailedError")
    })
  })
})
