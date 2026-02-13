import type {
  LanguageModelV2Prompt,
  LanguageModelV2Message,
} from "@ai-sdk/provider"
import type { Provider } from "./provider.js"

/**
 * ProviderTransform namespace — provider-specific message and option transforms.
 * Aligned with opencode's ProviderTransform namespace.
 */
export namespace ProviderTransform {
  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  /** Default max output tokens cap. */
  export const OUTPUT_TOKEN_MAX = 128000

  // ---------------------------------------------------------------------------
  // SDK key mapping (providerID → SDK providerOptions key)
  // ---------------------------------------------------------------------------

  const SDK_KEYS: Record<string, string> = {
    anthropic: "anthropic",
    openai: "openai",
    google: "google",
    "openai-compatible": "openaiCompatible",
    "kimi-for-coding": "anthropic",
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Transform messages before sending to the model.
   * Handles provider-specific quirks (empty messages, toolCallId normalization, cache control, etc.).
   */
  export function message(
    messages: LanguageModelV2Prompt,
    model: Provider.Model,
    _options?: Record<string, unknown>,
  ): LanguageModelV2Prompt {
    let result = [...messages]

    // Anthropic-specific transforms
    if (isAnthropic(model)) {
      result = normalizeAnthropicMessages(result)
      result = addAnthropicCacheControl(result)
    }

    // Normalize toolCallIds for all providers
    result = normalizeToolCallIds(result, model)

    return result
  }

  /**
   * Map providerOptions to the correct SDK key.
   * Different SDKs expect options under different keys (e.g. "anthropic", "openai", "google").
   */
  export function providerOptions(
    model: Provider.Model,
    options?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (!options || Object.keys(options).length === 0) return undefined

    const sdkKey = SDK_KEYS[model.providerID]
    if (!sdkKey) return options

    return { [sdkKey]: options }
  }

  /**
   * Get the maximum output tokens for a model.
   */
  export function maxOutputTokens(model: Provider.Model): number {
    return Math.min(model.limit.output, OUTPUT_TOKEN_MAX)
  }

  /**
   * Get the temperature for a model, respecting its capabilities.
   */
  export function temperature(
    model: Provider.Model,
    options?: { temperature?: number },
  ): number | undefined {
    if (!model.capabilities.temperature) return undefined
    return options?.temperature ?? 0
  }

  /**
   * Get base provider options for a model.
   */
  export function options(model: Provider.Model): {
    maxOutputTokens: number
    temperature: number | undefined
  } {
    return {
      maxOutputTokens: maxOutputTokens(model),
      temperature: temperature(model),
    }
  }

  /**
   * Get minimal provider options for small model tasks (e.g. title generation).
   */
  export function smallOptions(model: Provider.Model): {
    maxOutputTokens: number
    temperature: number | undefined
  } {
    return {
      maxOutputTokens: Math.min(model.limit.output, 1024),
      temperature: model.capabilities.temperature ? 0 : undefined,
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  function isAnthropic(model: Provider.Model): boolean {
    return (
      model.providerID === "anthropic" ||
      model.api.npm === "@ai-sdk/anthropic"
    )
  }

  /**
   * Anthropic requires:
   * - No empty messages
   * - No empty text parts
   * - toolCallId must match [a-zA-Z0-9_]+
   */
  function normalizeAnthropicMessages(messages: LanguageModelV2Prompt): LanguageModelV2Prompt {
    return messages
      .filter((msg) => {
        // Remove user/assistant messages with empty content array
        if (msg.role === "user" || msg.role === "assistant" || msg.role === "tool") {
          if (Array.isArray(msg.content) && msg.content.length === 0) return false
        }
        // Remove system messages with empty content
        if (msg.role === "system" && !msg.content) return false
        return true
      })
      .map((msg) => {
        if (msg.role === "assistant" && Array.isArray(msg.content)) {
          // Filter out empty text parts
          const content = msg.content.filter((part) => {
            if (part.type === "text" && !part.text) return false
            if (part.type === "reasoning" && !part.text) return false
            return true
          })
          if (content.length === 0) {
            // Replace with a minimal text part to avoid empty assistant message
            return { ...msg, content: [{ type: "text" as const, text: "..." }] }
          }
          return { ...msg, content }
        }
        return msg
      })
  }

  /**
   * Add Anthropic cache control markers to system and recent messages.
   * This enables prompt caching to reduce costs.
   */
  function addAnthropicCacheControl(messages: LanguageModelV2Prompt): LanguageModelV2Prompt {
    return messages.map((msg, i) => {
      // Add cache control to system messages
      if (msg.role === "system") {
        return {
          ...msg,
          providerOptions: {
            ...msg.providerOptions,
            anthropic: {
              ...(msg.providerOptions?.anthropic as Record<string, unknown> ?? {}),
              cacheControl: { type: "ephemeral" },
            },
          },
        }
      }

      // Add cache control to the last few user messages
      if (msg.role === "user" && i >= messages.length - 4) {
        return {
          ...msg,
          providerOptions: {
            ...msg.providerOptions,
            anthropic: {
              ...(msg.providerOptions?.anthropic as Record<string, unknown> ?? {}),
              cacheControl: { type: "ephemeral" },
            },
          },
        }
      }

      return msg
    })
  }

  /**
   * Normalize toolCallId to match provider requirements.
   * - Anthropic: [a-zA-Z0-9_]+ (replace non-matching chars with underscore)
   */
  function normalizeToolCallIds(messages: LanguageModelV2Prompt, model: Provider.Model): LanguageModelV2Prompt {
    if (!isAnthropic(model)) return messages

    return messages.map((msg) => {
      if (msg.role !== "assistant" && msg.role !== "tool") return msg

      const content = msg.content.map((part) => {
        if (part.type === "tool-call" && part.toolCallId) {
          return {
            ...part,
            toolCallId: part.toolCallId.replace(/[^a-zA-Z0-9_]/g, "_"),
          }
        }
        if (part.type === "tool-result" && part.toolCallId) {
          return {
            ...part,
            toolCallId: part.toolCallId.replace(/[^a-zA-Z0-9_]/g, "_"),
          }
        }
        return part
      })

      return { ...msg, content } as LanguageModelV2Message
    })
  }
}
