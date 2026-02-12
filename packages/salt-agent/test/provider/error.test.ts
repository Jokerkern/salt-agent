import { describe, it, expect } from "vitest"
import { APICallError } from "ai"
import { ProviderError } from "../../src/provider/error.js"

// Helper to create a minimal APICallError
function makeAPICallError(options: {
  message: string
  statusCode?: number
  responseBody?: string
  isRetryable?: boolean
  url?: string
  requestBodyValues?: Record<string, unknown>
}): APICallError {
  return new APICallError({
    message: options.message,
    statusCode: options.statusCode ?? 400,
    responseBody: options.responseBody ?? "",
    isRetryable: options.isRetryable ?? false,
    url: options.url ?? "https://api.test.com",
    requestBodyValues: options.requestBodyValues ?? {},
  })
}

describe("ProviderError", () => {
  // ---------------------------------------------------------------------------
  // parseAPICallError
  // ---------------------------------------------------------------------------

  describe("parseAPICallError", () => {
    it("detects context overflow from Anthropic", () => {
      const error = makeAPICallError({
        message: "prompt is too long: 250000 tokens > 200000 maximum",
      })
      const result = ProviderError.parseAPICallError({ providerID: "anthropic", error })
      expect(result.type).toBe("context_overflow")
      expect(result.message).toContain("prompt is too long")
    })

    it("detects context overflow from OpenAI", () => {
      const error = makeAPICallError({
        message: "This model's maximum context length is 128000 tokens",
        responseBody: JSON.stringify({
          error: {
            message: "This model's maximum context length is 128000 tokens",
            code: "context_length_exceeded",
          },
        }),
      })
      const result = ProviderError.parseAPICallError({ providerID: "openai", error })
      expect(result.type).toBe("context_overflow")
    })

    it("detects context overflow from Google", () => {
      const error = makeAPICallError({
        message: "input token count 1000000 exceeds the maximum of 128000",
      })
      const result = ProviderError.parseAPICallError({ providerID: "google", error })
      expect(result.type).toBe("context_overflow")
    })

    it("detects context overflow from generic pattern", () => {
      const error = makeAPICallError({
        message: "context_length_exceeded: too many tokens",
      })
      const result = ProviderError.parseAPICallError({ providerID: "custom", error })
      expect(result.type).toBe("context_overflow")
    })

    it("classifies non-overflow error as api_error", () => {
      const error = makeAPICallError({
        message: "Invalid API key",
        statusCode: 401,
      })
      const result = ProviderError.parseAPICallError({ providerID: "openai", error })
      expect(result.type).toBe("api_error")
      if (result.type === "api_error") {
        expect(result.statusCode).toBe(401)
        expect(result.message).toBe("Invalid API key")
      }
    })

    it("extracts message from response body", () => {
      const error = makeAPICallError({
        message: "400 Bad Request",
        responseBody: JSON.stringify({
          error: { message: "The model does not exist" },
        }),
      })
      const result = ProviderError.parseAPICallError({ providerID: "openai", error })
      expect(result.type).toBe("api_error")
      expect(result.message).toBe("The model does not exist")
    })

    it("preserves isRetryable flag", () => {
      const error = makeAPICallError({
        message: "Rate limit exceeded",
        statusCode: 429,
        isRetryable: true,
      })
      const result = ProviderError.parseAPICallError({ providerID: "openai", error })
      expect(result.type).toBe("api_error")
      if (result.type === "api_error") {
        expect(result.isRetryable).toBe(true)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // parseStreamError
  // ---------------------------------------------------------------------------

  describe("parseStreamError", () => {
    it("parses Anthropic SSE error with context overflow", () => {
      const input = JSON.stringify({
        type: "error",
        error: {
          message: "prompt is too long: 250000 tokens > 200000 maximum",
        },
      })
      const result = ProviderError.parseStreamError(input)
      expect(result).toBeDefined()
      expect(result!.type).toBe("context_overflow")
    })

    it("parses OpenAI context_length_exceeded error", () => {
      const input = JSON.stringify({
        error: {
          code: "context_length_exceeded",
          message: "Maximum context length exceeded",
        },
      })
      const result = ProviderError.parseStreamError(input)
      expect(result).toBeDefined()
      expect(result!.type).toBe("context_overflow")
    })

    it("parses insufficient_quota error", () => {
      const input = JSON.stringify({
        error: {
          code: "insufficient_quota",
          message: "You have exceeded your quota",
        },
      })
      const result = ProviderError.parseStreamError(input)
      expect(result).toBeDefined()
      expect(result!.type).toBe("api_error")
    })

    it("returns undefined for non-error input", () => {
      expect(ProviderError.parseStreamError("hello")).toBeUndefined()
      expect(ProviderError.parseStreamError(null)).toBeUndefined()
      expect(ProviderError.parseStreamError(undefined)).toBeUndefined()
      expect(ProviderError.parseStreamError(42)).toBeUndefined()
    })

    it("returns undefined for unrecognized error format", () => {
      const input = JSON.stringify({ status: "error", detail: "something went wrong" })
      expect(ProviderError.parseStreamError(input)).toBeUndefined()
    })

    it("accepts object input (not just string)", () => {
      const input = {
        type: "error",
        error: {
          message: "prompt is too long",
        },
      }
      const result = ProviderError.parseStreamError(input)
      expect(result).toBeDefined()
      expect(result!.type).toBe("context_overflow")
    })
  })

  // ---------------------------------------------------------------------------
  // isContextOverflow
  // ---------------------------------------------------------------------------

  describe("isContextOverflow", () => {
    it("detects various overflow patterns", () => {
      const patterns = [
        "prompt is too long",
        "input is too long for requested model",
        "exceeds the context window",
        "input token count 200000 exceeds the maximum 100000",
        "maximum prompt length is 128000",
        "reduce the length of the messages",
        "maximum context length is 128000 tokens",
        "exceeds the limit of 200000",
        "exceeds the available context size",
        "greater than the context length",
        "context window exceeds limit",
        "exceeded model token limit",
        "context_length_exceeded",
      ]
      for (const pattern of patterns) {
        expect(ProviderError.isContextOverflow(pattern), `Should match: ${pattern}`).toBe(true)
      }
    })

    it("does not match non-overflow messages", () => {
      expect(ProviderError.isContextOverflow("Invalid API key")).toBe(false)
      expect(ProviderError.isContextOverflow("Rate limit exceeded")).toBe(false)
      expect(ProviderError.isContextOverflow("Model not found")).toBe(false)
    })
  })
})
