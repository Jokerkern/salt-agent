import { describe, it, expect, afterEach, beforeEach } from "vitest"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { Config } from "../../src/config/config.js"
import { Bus } from "../../src/bus/bus.js"

const testDir = path.join(os.tmpdir(), `salt-agent-config-test-${Date.now()}`)
process.env["SALT_DATA_DIR"] = testDir

describe("Config", () => {
  beforeEach(() => {
    Config.reset()
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  // ---------------------------------------------------------------------------
  // Schema validation
  // ---------------------------------------------------------------------------

  describe("schema", () => {
    it("accepts empty config", () => {
      const result = Config.Info.safeParse({})
      expect(result.success).toBe(true)
    })

    it("accepts valid full config", () => {
      const result = Config.Info.safeParse({
        model: "anthropic/claude-sonnet-4-20250514",
        provider: {
          openai: {
            options: {
              apiKey: "sk-test",
              baseURL: "https://api.openai.com/v1",
            },
            models: {
              "gpt-4o": {},
              "gpt-4o-mini": { maxTokens: 4096 },
            },
          },
          anthropic: {
            options: { apiKey: "sk-ant-test" },
          },
        },
      })
      expect(result.success).toBe(true)
    })

    it("rejects unknown top-level keys (strict)", () => {
      const result = Config.Info.safeParse({
        model: "foo/bar",
        unknownKey: 123,
      })
      expect(result.success).toBe(false)
    })

    it("rejects unknown provider keys (strict)", () => {
      const result = Config.Info.safeParse({
        provider: {
          openai: {
            options: { apiKey: "sk-test" },
            unknownField: true,
          },
        },
      })
      expect(result.success).toBe(false)
    })

    it("accepts extra keys in options (catchall)", () => {
      const result = Config.Info.safeParse({
        provider: {
          custom: {
            options: {
              apiKey: "sk-test",
              customOption: "value",
            },
          },
        },
      })
      expect(result.success).toBe(true)
    })

    it("accepts provider with only options", () => {
      const result = Config.Info.safeParse({
        provider: {
          anthropic: { options: { apiKey: "sk-ant-test" } },
        },
      })
      expect(result.success).toBe(true)
    })

    it("accepts provider with empty object", () => {
      const result = Config.Info.safeParse({
        provider: {
          custom: {},
        },
      })
      expect(result.success).toBe(true)
    })

    it("accepts provider with only models", () => {
      const result = Config.Info.safeParse({
        provider: {
          openai: {
            models: {
              "gpt-4o": {},
            },
          },
        },
      })
      expect(result.success).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // get()
  // ---------------------------------------------------------------------------

  describe("get", () => {
    it("creates default config on first run", async () => {
      const config = await Config.get()
      expect(config).toEqual({})

      // File should exist on disk
      const file = path.join(testDir, "config", "salt-agent.json")
      const content = JSON.parse(await fs.readFile(file, "utf-8"))
      expect(content).toEqual({})
    })

    it("loads existing config from disk", async () => {
      const dir = path.join(testDir, "config")
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(
        path.join(dir, "salt-agent.json"),
        JSON.stringify({
          model: "openai/gpt-4o",
          provider: {
            openai: { options: { apiKey: "sk-test" } },
          },
        }),
      )

      const config = await Config.get()
      expect(config.model).toBe("openai/gpt-4o")
      expect(config.provider?.openai?.options?.apiKey).toBe("sk-test")
    })

    it("caches after first load", async () => {
      const a = await Config.get()
      const b = await Config.get()
      expect(a).toBe(b) // same reference
    })

    it("throws InvalidError for malformed JSON", async () => {
      const dir = path.join(testDir, "config")
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, "salt-agent.json"), "not json{{{")

      try {
        await Config.get()
        expect.fail("should have thrown")
      } catch (e) {
        expect(Config.InvalidError.isInstance(e)).toBe(true)
      }
    })

    it("throws InvalidError for schema violation", async () => {
      const dir = path.join(testDir, "config")
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(
        path.join(dir, "salt-agent.json"),
        JSON.stringify({ model: 123 }), // model should be string
      )

      try {
        await Config.get()
        expect.fail("should have thrown")
      } catch (e) {
        expect(Config.InvalidError.isInstance(e)).toBe(true)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // save()
  // ---------------------------------------------------------------------------

  describe("save", () => {
    it("saves new config and returns merged result", async () => {
      const result = await Config.save({
        model: "anthropic/claude-sonnet-4-20250514",
      })
      expect(result.model).toBe("anthropic/claude-sonnet-4-20250514")

      // Verify persisted
      Config.reset()
      const loaded = await Config.get()
      expect(loaded.model).toBe("anthropic/claude-sonnet-4-20250514")
    })

    it("merges provider config across saves", async () => {
      await Config.save({
        provider: {
          openai: { options: { apiKey: "sk-openai" } },
        },
      })

      const result = await Config.save({
        provider: {
          anthropic: { options: { apiKey: "sk-ant" } },
        },
      })

      expect(result.provider?.openai?.options?.apiKey).toBe("sk-openai")
      expect(result.provider?.anthropic?.options?.apiKey).toBe("sk-ant")
    })

    it("deep merges provider options", async () => {
      await Config.save({
        provider: {
          openai: {
            options: { apiKey: "sk-old", baseURL: "https://api.openai.com/v1" },
          },
        },
      })

      const result = await Config.save({
        provider: {
          openai: { options: { apiKey: "sk-new" } },
        },
      })

      expect(result.provider?.openai?.options?.apiKey).toBe("sk-new")
      expect(result.provider?.openai?.options?.baseURL).toBe("https://api.openai.com/v1")
    })

    it("deep merges provider models", async () => {
      await Config.save({
        provider: {
          openai: {
            options: { apiKey: "sk-test" },
            models: { "gpt-4o": { maxTokens: 4096 } },
          },
        },
      })

      const result = await Config.save({
        provider: {
          openai: {
            models: { "gpt-4o-mini": { maxTokens: 2048 } },
          },
        },
      })

      // Both models should exist
      expect(result.provider?.openai?.models?.["gpt-4o"]).toEqual({ maxTokens: 4096 })
      expect(result.provider?.openai?.models?.["gpt-4o-mini"]).toEqual({ maxTokens: 2048 })
      // Options preserved
      expect(result.provider?.openai?.options?.apiKey).toBe("sk-test")
    })

    it("publishes config.updated event", async () => {
      const events: Config.Info[] = []
      const unsub = Bus.subscribe(Config.Event.Updated, (event) => {
        events.push(event.properties.config)
      })

      await Config.save({ model: "openai/gpt-4o" })

      expect(events).toHaveLength(1)
      expect(events[0]?.model).toBe("openai/gpt-4o")
      unsub()
    })

    it("invalidates cache after save", async () => {
      const before = await Config.get()
      await Config.save({ model: "new/model" })
      const after = await Config.get()

      expect(before).not.toBe(after) // different reference
      expect(after.model).toBe("new/model")
    })

    it("rejects invalid patch", async () => {
      try {
        await Config.save({ model: "valid" } as Config.Info)
        await Config.save({
          provider: {
            // @ts-expect-error intentionally invalid
            bad: { options: { apiKey: 123 } },
          },
        })
        expect.fail("should have thrown")
      } catch (e) {
        expect(Config.InvalidError.isInstance(e)).toBe(true)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe("edge cases", () => {
    it("handles concurrent get() calls", async () => {
      const [a, b, c] = await Promise.all([Config.get(), Config.get(), Config.get()])
      expect(a).toBe(b)
      expect(b).toBe(c)
    })

    it("save() on empty config works", async () => {
      const result = await Config.save({})
      expect(result).toEqual({})
    })

    it("model can be overwritten", async () => {
      await Config.save({ model: "a/b" })
      const result = await Config.save({ model: "c/d" })
      expect(result.model).toBe("c/d")
    })

    it("three-level deep merge works", async () => {
      await Config.save({
        provider: {
          openai: {
            options: { apiKey: "sk-1", baseURL: "https://a.com" },
            models: { "gpt-4o": { temp: 0.7 } },
          },
        },
      })

      // Only update apiKey, everything else preserved
      const result = await Config.save({
        provider: {
          openai: { options: { apiKey: "sk-2" } },
        },
      })

      expect(result.provider?.openai?.options?.apiKey).toBe("sk-2")
      expect(result.provider?.openai?.options?.baseURL).toBe("https://a.com")
      expect(result.provider?.openai?.models?.["gpt-4o"]).toEqual({ temp: 0.7 })
    })
  })
})
