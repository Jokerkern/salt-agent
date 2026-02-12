import { describe, it, expect, afterEach, beforeEach } from "vitest"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { Provider } from "../../src/provider/provider.js"
import { Models } from "../../src/provider/models.js"
import { Config } from "../../src/config/config.js"

const testDir = path.join(os.tmpdir(), `salt-agent-provider-test-${Date.now()}`)
process.env["SALT_DATA_DIR"] = testDir

describe("Provider", () => {
  beforeEach(() => {
    Provider.reset()
    Config.reset()
  })

  afterEach(async () => {
    // Clean env vars that tests might have set
    delete process.env["ANTHROPIC_API_KEY"]
    delete process.env["OPENAI_API_KEY"]
    delete process.env["GOOGLE_GENERATIVE_AI_API_KEY"]
    await fs.rm(testDir, { recursive: true, force: true })
  })

  // ---------------------------------------------------------------------------
  // parseModel
  // ---------------------------------------------------------------------------

  describe("parseModel", () => {
    it("parses provider/model format", () => {
      const result = Provider.parseModel("anthropic/claude-sonnet-4-20250514")
      expect(result).toEqual({
        providerID: "anthropic",
        modelID: "claude-sonnet-4-20250514",
      })
    })

    it("handles model IDs with slashes", () => {
      const result = Provider.parseModel("custom/my/model/v2")
      expect(result).toEqual({
        providerID: "custom",
        modelID: "my/model/v2",
      })
    })

    it("throws on invalid format (no slash)", () => {
      expect(() => Provider.parseModel("justmodel")).toThrow('Expected "provider/model"')
    })
  })

  // ---------------------------------------------------------------------------
  // Model schema
  // ---------------------------------------------------------------------------

  describe("Model schema", () => {
    it("accepts a valid model", () => {
      const result = Provider.Model.safeParse({
        id: "claude-sonnet-4-20250514",
        providerID: "anthropic",
        api: { id: "claude-sonnet-4-20250514", url: "https://api.anthropic.com", npm: "@ai-sdk/anthropic" },
        name: "Claude Sonnet 4",
        capabilities: {
          temperature: true,
          reasoning: true,
          attachment: true,
          toolcall: true,
          input: { text: true, image: true, audio: false, video: false, pdf: true },
          output: { text: true, image: false, audio: false, video: false, pdf: false },
        },
        cost: { input: 3, output: 15, cache: { read: 0.3, write: 3.75 } },
        limit: { context: 200000, output: 16000 },
        status: "active",
        options: {},
        headers: {},
        release_date: "2025-05-14",
      })
      expect(result.success).toBe(true)
    })

    it("rejects model without required fields", () => {
      const result = Provider.Model.safeParse({ id: "test" })
      expect(result.success).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Info schema
  // ---------------------------------------------------------------------------

  describe("Info schema", () => {
    it("accepts a valid provider info", () => {
      const result = Provider.Info.safeParse({
        id: "anthropic",
        name: "Anthropic",
        source: "builtin",
        env: ["ANTHROPIC_API_KEY"],
        options: {},
        models: {},
      })
      expect(result.success).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Error types
  // ---------------------------------------------------------------------------

  describe("errors", () => {
    it("creates ModelNotFoundError with data", () => {
      const err = new Provider.ModelNotFoundError({
        providerID: "anthropic",
        modelID: "nonexistent",
        suggestions: ["claude-sonnet-4-20250514"],
      })
      expect(err.name).toBe("ProviderModelNotFoundError")
      expect(err.data.providerID).toBe("anthropic")
      expect(err.data.suggestions).toEqual(["claude-sonnet-4-20250514"])
      expect(Provider.ModelNotFoundError.isInstance(err)).toBe(true)
    })

    it("creates InitError with data", () => {
      const err = new Provider.InitError({
        providerID: "bad-provider",
        message: "failed to initialize",
      })
      expect(err.name).toBe("ProviderInitError")
      expect(err.data.providerID).toBe("bad-provider")
    })
  })

  // ---------------------------------------------------------------------------
  // list / getModel / getProvider — with API key
  // ---------------------------------------------------------------------------

  describe("with API key", () => {
    beforeEach(() => {
      process.env["ANTHROPIC_API_KEY"] = "sk-ant-test-key"
    })

    it("list() includes providers with API keys", async () => {
      const providers = await Provider.list()
      expect(providers).toHaveProperty("anthropic")
      expect(providers.anthropic.key).toBe("sk-ant-test-key")
      expect(providers.anthropic.source).toBe("env")
    })

    it("list() excludes providers without API keys", async () => {
      const providers = await Provider.list()
      expect(providers).not.toHaveProperty("openai")
      expect(providers).not.toHaveProperty("google")
    })

    it("getProvider() returns provider info", async () => {
      const provider = await Provider.getProvider("anthropic")
      expect(provider).toBeDefined()
      expect(provider!.id).toBe("anthropic")
      expect(provider!.name).toBe("Anthropic")
    })

    it("getProvider() returns undefined for unknown provider", async () => {
      const provider = await Provider.getProvider("nonexistent")
      expect(provider).toBeUndefined()
    })

    it("getModel() returns a model", async () => {
      const model = await Provider.getModel("anthropic", "claude-sonnet-4-20250514")
      expect(model.id).toBe("claude-sonnet-4-20250514")
      expect(model.providerID).toBe("anthropic")
      expect(model.name).toBe("Claude Sonnet 4")
      expect(model.capabilities.reasoning).toBe(true)
      expect(model.capabilities.toolcall).toBe(true)
      expect(model.cost.input).toBe(3)
    })

    it("getModel() throws for unknown model", async () => {
      await expect(Provider.getModel("anthropic", "nonexistent")).rejects.toThrow()
    })

    it("getModel() throws for unknown provider", async () => {
      await expect(Provider.getModel("nonexistent", "some-model")).rejects.toThrow()
    })

    it("getModel() includes suggestions on not found", async () => {
      try {
        await Provider.getModel("anthropic", "nonexistent")
      } catch (e) {
        expect(Provider.ModelNotFoundError.isInstance(e)).toBe(true)
        if (Provider.ModelNotFoundError.isInstance(e)) {
          expect(e.data.suggestions).toBeDefined()
          expect(e.data.suggestions!.length).toBeGreaterThan(0)
        }
      }
    })
  })

  // ---------------------------------------------------------------------------
  // defaultModel
  // ---------------------------------------------------------------------------

  describe("defaultModel", () => {
    it("uses config model when set", async () => {
      process.env["ANTHROPIC_API_KEY"] = "sk-ant-test"
      // Write config with model
      const configDir = path.join(testDir, "config")
      await fs.mkdir(configDir, { recursive: true })
      await fs.writeFile(
        path.join(configDir, "salt-agent.json"),
        JSON.stringify({ model: "anthropic/claude-sonnet-4-20250514" }),
      )
      const result = await Provider.defaultModel()
      expect(result).toEqual({
        providerID: "anthropic",
        modelID: "claude-sonnet-4-20250514",
      })
    })

    it("falls back to first available provider", async () => {
      process.env["OPENAI_API_KEY"] = "sk-test-openai"
      const result = await Provider.defaultModel()
      expect(result.providerID).toBe("openai")
      expect(result.modelID).toBeTruthy()
    })
  })

  // ---------------------------------------------------------------------------
  // Multiple providers
  // ---------------------------------------------------------------------------

  describe("multiple providers", () => {
    it("lists multiple providers when multiple keys are set", async () => {
      process.env["ANTHROPIC_API_KEY"] = "sk-ant-test"
      process.env["OPENAI_API_KEY"] = "sk-openai-test"
      const providers = await Provider.list()
      expect(providers).toHaveProperty("anthropic")
      expect(providers).toHaveProperty("openai")
      expect(Object.keys(providers).length).toBeGreaterThanOrEqual(2)
    })
  })

  // ---------------------------------------------------------------------------
  // Config-based provider
  // ---------------------------------------------------------------------------

  describe("config provider override", () => {
    it("uses apiKey from config", async () => {
      const configDir = path.join(testDir, "config")
      await fs.mkdir(configDir, { recursive: true })
      await fs.writeFile(
        path.join(configDir, "salt-agent.json"),
        JSON.stringify({
          provider: {
            anthropic: {
              options: { apiKey: "sk-config-key" },
            },
          },
        }),
      )
      const providers = await Provider.list()
      expect(providers).toHaveProperty("anthropic")
      expect(providers.anthropic.key).toBe("sk-config-key")
      expect(providers.anthropic.source).toBe("config")
    })
  })

  // ---------------------------------------------------------------------------
  // sort
  // ---------------------------------------------------------------------------

  describe("sort", () => {
    const makeModel = (name: string, status: "active" | "beta" | "alpha" | "deprecated") =>
      ({
        id: name,
        providerID: "test",
        api: { id: name, url: "", npm: "" },
        name,
        capabilities: {
          temperature: true,
          reasoning: false,
          attachment: false,
          toolcall: true,
          input: { text: true, image: false, audio: false, video: false, pdf: false },
          output: { text: true, image: false, audio: false, video: false, pdf: false },
        },
        cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
        limit: { context: 128000, output: 8192 },
        status,
        options: {},
        headers: {},
        release_date: "2025-01-01",
      }) as Provider.Model

    it("sorts by status priority then name", () => {
      const models = [
        makeModel("deprecated-a", "deprecated"),
        makeModel("beta-b", "beta"),
        makeModel("active-c", "active"),
        makeModel("active-a", "active"),
        makeModel("alpha-z", "alpha"),
      ]
      const sorted = Provider.sort(models)
      expect(sorted.map((m) => m.id)).toEqual([
        "active-a",
        "active-c",
        "beta-b",
        "alpha-z",
        "deprecated-a",
      ])
    })
  })

  // ---------------------------------------------------------------------------
  // calculateCost
  // ---------------------------------------------------------------------------

  describe("calculateCost", () => {
    it("calculates correct cost", () => {
      const model = {
        cost: { input: 3, output: 15, cache: { read: 0.3, write: 3.75 } },
      } as Provider.Model

      const cost = Provider.calculateCost(model, {
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 200,
        cacheWriteTokens: 100,
      })

      // (1000*3 + 500*15 + 200*0.3 + 100*3.75) / 1_000_000
      // = (3000 + 7500 + 60 + 375) / 1_000_000
      // = 10935 / 1_000_000
      // = 0.010935
      expect(cost).toBeCloseTo(0.010935, 6)
    })

    it("handles zero usage", () => {
      const model = {
        cost: { input: 3, output: 15, cache: { read: 0.3, write: 3.75 } },
      } as Provider.Model

      const cost = Provider.calculateCost(model, {
        inputTokens: 0,
        outputTokens: 0,
      })
      expect(cost).toBe(0)
    })

    it("includes reasoning tokens", () => {
      const model = {
        cost: { input: 3, output: 15, cache: { read: 0, write: 0 } },
      } as Provider.Model

      const cost = Provider.calculateCost(model, {
        inputTokens: 0,
        outputTokens: 100,
        reasoningTokens: 200,
      })

      // (100*15 + 200*15) / 1_000_000 = 4500 / 1_000_000 = 0.0045
      expect(cost).toBeCloseTo(0.0045, 6)
    })
  })
})
