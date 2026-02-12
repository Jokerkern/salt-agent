import { describe, it, expect } from "vitest"
import type { LanguageModelV2Prompt } from "@ai-sdk/provider"
import { ProviderTransform } from "../../src/provider/transform.js"
import type { Provider } from "../../src/provider/provider.js"

// Helper to create a minimal Provider.Model for testing
function makeModel(overrides: Partial<Provider.Model> = {}): Provider.Model {
  return {
    id: "test-model",
    providerID: "test",
    api: { id: "test-model", url: "https://api.test.com", npm: "@ai-sdk/openai" },
    name: "Test Model",
    capabilities: {
      temperature: true,
      reasoning: false,
      attachment: false,
      toolcall: true,
      input: { text: true, image: false, audio: false, video: false, pdf: false },
      output: { text: true, image: false, audio: false, video: false, pdf: false },
    },
    cost: { input: 1, output: 2, cache: { read: 0, write: 0 } },
    limit: { context: 128000, output: 8192 },
    status: "active",
    options: {},
    headers: {},
    release_date: "2025-01-01",
    ...overrides,
  } as Provider.Model
}

function anthropicModel(overrides: Partial<Provider.Model> = {}): Provider.Model {
  return makeModel({
    providerID: "anthropic",
    api: { id: "claude-sonnet-4", url: "https://api.anthropic.com", npm: "@ai-sdk/anthropic" },
    ...overrides,
  })
}

describe("ProviderTransform", () => {
  // ---------------------------------------------------------------------------
  // message
  // ---------------------------------------------------------------------------

  describe("message", () => {
    it("passes through messages for non-Anthropic providers", () => {
      const messages: LanguageModelV2Prompt = [
        { role: "system", content: "You are helpful." },
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ]
      const model = makeModel()
      const result = ProviderTransform.message(messages, model)
      expect(result).toHaveLength(2)
      expect(result[0].role).toBe("system")
    })

    it("removes empty content for Anthropic", () => {
      const messages: LanguageModelV2Prompt = [
        { role: "system", content: "You are helpful." },
        { role: "user", content: [] },
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ]
      const model = anthropicModel()
      const result = ProviderTransform.message(messages, model)
      // Empty user message should be removed
      const userMessages = result.filter((m) => m.role === "user")
      expect(userMessages).toHaveLength(1)
    })

    it("removes empty text parts for Anthropic assistant messages", () => {
      const messages: LanguageModelV2Prompt = [
        {
          role: "assistant",
          content: [
            { type: "text", text: "" },
            { type: "text", text: "Hello" },
          ],
        },
      ]
      const model = anthropicModel()
      const result = ProviderTransform.message(messages, model)
      const assistant = result.find((m) => m.role === "assistant")!
      expect(assistant.content).toHaveLength(1)
    })

    it("adds cache control to Anthropic system messages", () => {
      const messages: LanguageModelV2Prompt = [
        { role: "system", content: "You are helpful." },
        { role: "user", content: [{ type: "text", text: "Hi" }] },
      ]
      const model = anthropicModel()
      const result = ProviderTransform.message(messages, model)
      const system = result.find((m) => m.role === "system")!
      expect(system.providerOptions?.anthropic).toBeDefined()
      expect((system.providerOptions!.anthropic as Record<string, unknown>).cacheControl).toEqual({
        type: "ephemeral",
      })
    })

    it("normalizes toolCallIds for Anthropic", () => {
      const messages: LanguageModelV2Prompt = [
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "call-abc.123-def",
              toolName: "read",
              input: {},
            },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call-abc.123-def",
              toolName: "read",
              output: { type: "text", value: "content" },
            },
          ],
        },
      ]
      const model = anthropicModel()
      const result = ProviderTransform.message(messages, model)

      const assistant = result.find((m) => m.role === "assistant")!
      const toolCall = (assistant.content as Array<{ type: string; toolCallId: string }>)[0]
      expect(toolCall.toolCallId).toBe("call_abc_123_def")

      const tool = result.find((m) => m.role === "tool")!
      const toolResult = (tool.content as Array<{ type: string; toolCallId: string }>)[0]
      expect(toolResult.toolCallId).toBe("call_abc_123_def")
    })

    it("does not normalize toolCallIds for non-Anthropic providers", () => {
      const messages: LanguageModelV2Prompt = [
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "call-abc.123",
              toolName: "read",
              input: {},
            },
          ],
        },
      ]
      const model = makeModel()
      const result = ProviderTransform.message(messages, model)

      const assistant = result.find((m) => m.role === "assistant")!
      const toolCall = (assistant.content as Array<{ type: string; toolCallId: string }>)[0]
      expect(toolCall.toolCallId).toBe("call-abc.123")
    })
  })

  // ---------------------------------------------------------------------------
  // providerOptions
  // ---------------------------------------------------------------------------

  describe("providerOptions", () => {
    it("wraps options under SDK key for anthropic", () => {
      const model = anthropicModel()
      const result = ProviderTransform.providerOptions(model, { thinking: true })
      expect(result).toEqual({ anthropic: { thinking: true } })
    })

    it("wraps options under SDK key for openai", () => {
      const model = makeModel({ providerID: "openai" })
      const result = ProviderTransform.providerOptions(model, { store: true })
      expect(result).toEqual({ openai: { store: true } })
    })

    it("returns undefined for empty options", () => {
      const model = makeModel()
      expect(ProviderTransform.providerOptions(model, {})).toBeUndefined()
      expect(ProviderTransform.providerOptions(model, undefined)).toBeUndefined()
    })

    it("passes through for unknown providers", () => {
      const model = makeModel({ providerID: "custom-provider" })
      const result = ProviderTransform.providerOptions(model, { foo: "bar" })
      expect(result).toEqual({ foo: "bar" })
    })
  })

  // ---------------------------------------------------------------------------
  // maxOutputTokens
  // ---------------------------------------------------------------------------

  describe("maxOutputTokens", () => {
    it("returns model limit when within cap", () => {
      const model = makeModel({ limit: { context: 128000, output: 8192 } })
      expect(ProviderTransform.maxOutputTokens(model)).toBe(8192)
    })

    it("caps at OUTPUT_TOKEN_MAX", () => {
      const model = makeModel({ limit: { context: 1000000, output: 200000 } })
      expect(ProviderTransform.maxOutputTokens(model)).toBe(ProviderTransform.OUTPUT_TOKEN_MAX)
    })
  })

  // ---------------------------------------------------------------------------
  // temperature
  // ---------------------------------------------------------------------------

  describe("temperature", () => {
    it("returns default 0 when model supports temperature", () => {
      const model = makeModel({
        capabilities: {
          temperature: true,
          reasoning: false,
          attachment: false,
          toolcall: true,
          input: { text: true, image: false, audio: false, video: false, pdf: false },
          output: { text: true, image: false, audio: false, video: false, pdf: false },
        },
      })
      expect(ProviderTransform.temperature(model)).toBe(0)
    })

    it("returns undefined when model does not support temperature", () => {
      const model = makeModel({
        capabilities: {
          temperature: false,
          reasoning: true,
          attachment: false,
          toolcall: true,
          input: { text: true, image: false, audio: false, video: false, pdf: false },
          output: { text: true, image: false, audio: false, video: false, pdf: false },
        },
      })
      expect(ProviderTransform.temperature(model)).toBeUndefined()
    })

    it("uses provided temperature value", () => {
      const model = makeModel({
        capabilities: {
          temperature: true,
          reasoning: false,
          attachment: false,
          toolcall: true,
          input: { text: true, image: false, audio: false, video: false, pdf: false },
          output: { text: true, image: false, audio: false, video: false, pdf: false },
        },
      })
      expect(ProviderTransform.temperature(model, { temperature: 0.7 })).toBe(0.7)
    })
  })

  // ---------------------------------------------------------------------------
  // options / smallOptions
  // ---------------------------------------------------------------------------

  describe("options", () => {
    it("returns maxOutputTokens and temperature", () => {
      const model = makeModel({ limit: { context: 128000, output: 8192 } })
      const opts = ProviderTransform.options(model)
      expect(opts.maxOutputTokens).toBe(8192)
      expect(opts.temperature).toBe(0)
    })
  })

  describe("smallOptions", () => {
    it("caps maxOutputTokens at 1024", () => {
      const model = makeModel({ limit: { context: 128000, output: 8192 } })
      const opts = ProviderTransform.smallOptions(model)
      expect(opts.maxOutputTokens).toBe(1024)
    })

    it("uses model output if less than 1024", () => {
      const model = makeModel({ limit: { context: 128000, output: 512 } })
      const opts = ProviderTransform.smallOptions(model)
      expect(opts.maxOutputTokens).toBe(512)
    })
  })
})
