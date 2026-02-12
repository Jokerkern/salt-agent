import { describe, it, expect } from "vitest"
import { Models } from "../../src/provider/models.js"

describe("Models", () => {
  // ---------------------------------------------------------------------------
  // Static data
  // ---------------------------------------------------------------------------

  describe("get", () => {
    it("returns all built-in providers", () => {
      const providers = Models.get()
      expect(providers).toHaveProperty("anthropic")
      expect(providers).toHaveProperty("openai")
      expect(providers).toHaveProperty("google")
    })

    it("each provider has required fields", () => {
      const providers = Models.get()
      for (const [id, provider] of Object.entries(providers)) {
        expect(provider.id).toBe(id)
        expect(provider.name).toBeTruthy()
        expect(provider.npm).toBeTruthy()
        expect(provider.env.length).toBeGreaterThan(0)
        expect(Object.keys(provider.models).length).toBeGreaterThan(0)
      }
    })
  })

  describe("getProvider", () => {
    it("returns a specific provider", () => {
      const provider = Models.getProvider("anthropic")
      expect(provider).toBeDefined()
      expect(provider!.id).toBe("anthropic")
      expect(provider!.name).toBe("Anthropic")
    })

    it("returns undefined for unknown provider", () => {
      const provider = Models.getProvider("nonexistent")
      expect(provider).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // Schema validation
  // ---------------------------------------------------------------------------

  describe("schema", () => {
    it("Model schema accepts valid model", () => {
      const result = Models.Model.safeParse({
        id: "test-model",
        name: "Test Model",
        release_date: "2025-01-01",
        attachment: false,
        reasoning: false,
        temperature: true,
        tool_call: true,
        limit: { context: 128000, output: 8192 },
      })
      expect(result.success).toBe(true)
    })

    it("Model schema rejects missing required fields", () => {
      const result = Models.Model.safeParse({ id: "test" })
      expect(result.success).toBe(false)
    })

    it("Provider schema accepts valid provider", () => {
      const result = Models.Provider.safeParse({
        id: "test",
        name: "Test Provider",
        npm: "@test/test",
        env: ["TEST_API_KEY"],
        models: {},
      })
      expect(result.success).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Anthropic models
  // ---------------------------------------------------------------------------

  describe("anthropic models", () => {
    it("includes claude-sonnet-4", () => {
      const provider = Models.getProvider("anthropic")!
      const model = provider.models["claude-sonnet-4-20250514"]
      expect(model).toBeDefined()
      expect(model.name).toBe("Claude Sonnet 4")
      expect(model.reasoning).toBe(true)
      expect(model.tool_call).toBe(true)
      expect(model.cost).toBeDefined()
      expect(model.cost!.input).toBe(3)
      expect(model.cost!.output).toBe(15)
    })

    it("includes claude-haiku-3.5", () => {
      const provider = Models.getProvider("anthropic")!
      const model = provider.models["claude-haiku-3-5-20241022"]
      expect(model).toBeDefined()
      expect(model.reasoning).toBe(false)
    })

    it("all models have valid limits", () => {
      const provider = Models.getProvider("anthropic")!
      for (const model of Object.values(provider.models)) {
        expect(model.limit.context).toBeGreaterThan(0)
        expect(model.limit.output).toBeGreaterThan(0)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // OpenAI models
  // ---------------------------------------------------------------------------

  describe("openai models", () => {
    it("includes gpt-4.1", () => {
      const provider = Models.getProvider("openai")!
      const model = provider.models["gpt-4.1"]
      expect(model).toBeDefined()
      expect(model.tool_call).toBe(true)
    })

    it("includes o3-mini as reasoning model", () => {
      const provider = Models.getProvider("openai")!
      const model = provider.models["o3-mini"]
      expect(model).toBeDefined()
      expect(model.reasoning).toBe(true)
      expect(model.temperature).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Google models
  // ---------------------------------------------------------------------------

  describe("google models", () => {
    it("includes gemini-2.5-pro", () => {
      const provider = Models.getProvider("google")!
      const model = provider.models["gemini-2.5-pro"]
      expect(model).toBeDefined()
      expect(model.reasoning).toBe(true)
      expect(model.limit.context).toBe(1048576)
    })

    it("includes gemini-2.5-flash", () => {
      const provider = Models.getProvider("google")!
      const model = provider.models["gemini-2.5-flash"]
      expect(model).toBeDefined()
    })
  })

  // ---------------------------------------------------------------------------
  // All models pass schema validation
  // ---------------------------------------------------------------------------

  describe("all models pass schema", () => {
    it("every model in every provider passes Model schema", () => {
      const providers = Models.get()
      for (const provider of Object.values(providers)) {
        for (const [modelId, model] of Object.entries(provider.models)) {
          const result = Models.Model.safeParse(model)
          expect(result.success, `Model ${modelId} in ${provider.id} failed schema`).toBe(true)
        }
      }
    })

    it("every provider passes Provider schema", () => {
      const providers = Models.get()
      for (const [id, provider] of Object.entries(providers)) {
        const result = Models.Provider.safeParse(provider)
        expect(result.success, `Provider ${id} failed schema`).toBe(true)
      }
    })
  })
})
