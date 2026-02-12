import { APICallError } from "ai"

/**
 * Provider error parsing — classifies AI SDK errors into structured types.
 * Aligned with opencode's ProviderError namespace.
 */
export namespace ProviderError {
  // ---------------------------------------------------------------------------
  // Context overflow detection patterns
  // ---------------------------------------------------------------------------

  const OVERFLOW_PATTERNS = [
    /prompt is too long/i,
    /input is too long for requested model/i,
    /exceeds the context window/i,
    /input token count.*exceeds the maximum/i,
    /maximum prompt length is \d+/i,
    /reduce the length of the messages/i,
    /maximum context length is \d+ tokens/i,
    /exceeds the limit of \d+/i,
    /exceeds the available context size/i,
    /greater than the context length/i,
    /context window exceeds limit/i,
    /exceeded model token limit/i,
    /context[_ ]length[_ ]exceeded/i,
  ]

  function isOverflow(message: string): boolean {
    if (OVERFLOW_PATTERNS.some((p) => p.test(message))) return true
    return /^4(00|13)\s*(status code)?\s*\(no body\)/i.test(message)
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function extractMessage(_providerID: string, error: APICallError): string {
    const body = tryParseJSON(error.responseBody)
    if (body && typeof body === "object") {
      const err = (body as Record<string, unknown>).error
      if (err && typeof err === "object") {
        const msg = (err as Record<string, unknown>).message
        if (typeof msg === "string") return msg
      }
      const msg = (body as Record<string, unknown>).message
      if (typeof msg === "string") return msg
    }
    return error.message
  }

  function tryParseJSON(input: unknown): unknown {
    if (typeof input === "string") {
      try {
        return JSON.parse(input)
      } catch {
        return undefined
      }
    }
    if (typeof input === "object") return input
    return undefined
  }

  // ---------------------------------------------------------------------------
  // Parsed error types
  // ---------------------------------------------------------------------------

  export type ParsedStreamError =
    | {
        type: "context_overflow"
        message: string
        responseBody: string
      }
    | {
        type: "api_error"
        message: string
        isRetryable: false
        responseBody: string
      }

  export type ParsedAPICallError =
    | {
        type: "context_overflow"
        message: string
        responseBody?: string
      }
    | {
        type: "api_error"
        message: string
        statusCode?: number
        isRetryable: boolean
        responseBody?: string
      }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Parse an APICallError from the AI SDK into a structured error.
   * Returns either a context_overflow or api_error classification.
   */
  export function parseAPICallError(input: {
    providerID: string
    error: APICallError
  }): ParsedAPICallError {
    const msg = extractMessage(input.providerID, input.error)
    const responseBody =
      typeof input.error.responseBody === "string"
        ? input.error.responseBody
        : undefined

    if (isOverflow(msg)) {
      return {
        type: "context_overflow",
        message: msg,
        responseBody,
      }
    }

    return {
      type: "api_error",
      message: msg,
      statusCode: input.error.statusCode,
      isRetryable: input.error.isRetryable ?? false,
      responseBody,
    }
  }

  /**
   * Parse a stream error (from SSE body) into a structured error.
   * Returns undefined if the input is not a recognizable error.
   */
  export function parseStreamError(input: unknown): ParsedStreamError | undefined {
    const body = tryParseJSON(input)
    if (!body || typeof body !== "object") return undefined

    const record = body as Record<string, unknown>

    // Check for { type: "error", error: { ... } } shape (Anthropic SSE errors)
    if (record.type === "error" && typeof record.error === "object" && record.error !== null) {
      const err = record.error as Record<string, unknown>
      const msg = typeof err.message === "string" ? err.message : "Unknown error"
      const responseBody = typeof input === "string" ? input : JSON.stringify(input)

      if (isOverflow(msg)) {
        return { type: "context_overflow", message: msg, responseBody }
      }

      return { type: "api_error", message: msg, isRetryable: false, responseBody }
    }

    // Check for { error: { code: "context_length_exceeded", ... } } shape (OpenAI)
    if (typeof record.error === "object" && record.error !== null) {
      const err = record.error as Record<string, unknown>
      const code = err.code
      const msg = typeof err.message === "string" ? err.message : "Unknown error"
      const responseBody = typeof input === "string" ? input : JSON.stringify(input)

      if (code === "context_length_exceeded" || isOverflow(msg)) {
        return { type: "context_overflow", message: msg, responseBody }
      }

      if (
        code === "insufficient_quota" ||
        code === "usage_not_included" ||
        code === "invalid_prompt"
      ) {
        return { type: "api_error", message: msg, isRetryable: false, responseBody }
      }
    }

    return undefined
  }

  /**
   * Check if an error message indicates a context overflow.
   */
  export function isContextOverflow(message: string): boolean {
    return isOverflow(message)
  }
}
