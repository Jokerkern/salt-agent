import z from "zod"

/**
 * Static model registry — built-in provider and model definitions.
 * Aligned with opencode's ModelsDev namespace but uses static data instead of fetching from models.dev.
 */
export namespace Models {
  // ---------------------------------------------------------------------------
  // Schema
  // ---------------------------------------------------------------------------

  export const Model = z.object({
    id: z.string(),
    name: z.string(),
    family: z.string().optional(),
    release_date: z.string(),
    attachment: z.boolean(),
    reasoning: z.boolean(),
    temperature: z.boolean(),
    tool_call: z.boolean(),
    interleaved: z
      .union([
        z.literal(true),
        z.object({
          field: z.enum(["reasoning_content", "reasoning_details"]),
        }),
      ])
      .optional(),
    cost: z
      .object({
        input: z.number(),
        output: z.number(),
        cache_read: z.number().optional(),
        cache_write: z.number().optional(),
      })
      .optional(),
    limit: z.object({
      context: z.number(),
      input: z.number().optional(),
      output: z.number(),
    }),
    modalities: z
      .object({
        input: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
        output: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
      })
      .optional(),
    status: z.enum(["alpha", "beta", "deprecated"]).optional(),
    options: z.record(z.string(), z.any()).optional(),
    headers: z.record(z.string(), z.string()).optional(),
  })
  export type Model = z.infer<typeof Model>

  export const Provider = z.object({
    id: z.string(),
    name: z.string(),
    npm: z.string(),
    api: z.string().optional(),
    env: z.array(z.string()),
    models: z.record(z.string(), Model),
  })
  export type Provider = z.infer<typeof Provider>

  // ---------------------------------------------------------------------------
  // Static data
  // ---------------------------------------------------------------------------

  const PROVIDERS: Record<string, Provider> = {
    anthropic: {
      id: "anthropic",
      name: "Anthropic",
      npm: "@ai-sdk/anthropic",
      env: ["ANTHROPIC_API_KEY"],
      models: {
        "claude-sonnet-4-20250514": {
          id: "claude-sonnet-4-20250514",
          name: "Claude Sonnet 4",
          family: "claude-sonnet",
          release_date: "2025-05-14",
          attachment: true,
          reasoning: true,
          temperature: true,
          tool_call: true,
          cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
          limit: { context: 200000, output: 16000 },
          modalities: { input: ["text", "image", "pdf"], output: ["text"] },
        },
        "claude-haiku-3-5-20241022": {
          id: "claude-haiku-3-5-20241022",
          name: "Claude 3.5 Haiku",
          family: "claude-haiku",
          release_date: "2024-10-22",
          attachment: true,
          reasoning: false,
          temperature: true,
          tool_call: true,
          cost: { input: 0.8, output: 4, cache_read: 0.08, cache_write: 1 },
          limit: { context: 200000, output: 8192 },
          modalities: { input: ["text", "image"], output: ["text"] },
        },
        "claude-opus-4-20250514": {
          id: "claude-opus-4-20250514",
          name: "Claude Opus 4",
          family: "claude-opus",
          release_date: "2025-05-14",
          attachment: true,
          reasoning: true,
          temperature: true,
          tool_call: true,
          cost: { input: 15, output: 75, cache_read: 1.5, cache_write: 18.75 },
          limit: { context: 200000, output: 32000 },
          modalities: { input: ["text", "image", "pdf"], output: ["text"] },
        },
        "claude-sonnet-4-5-20250929": {
          id: "claude-sonnet-4-5-20250929",
          name: "Claude Sonnet 4.5",
          family: "claude-sonnet",
          release_date: "2025-09-29",
          attachment: true,
          reasoning: false,
          temperature: true,
          tool_call: true,
          cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
          limit: { context: 200000, output: 64000 },
          modalities: { input: ["text", "image", "pdf"], output: ["text"] },
        },
      },
    },

    openai: {
      id: "openai",
      name: "OpenAI",
      npm: "@ai-sdk/openai",
      env: ["OPENAI_API_KEY"],
      models: {
        "gpt-4.1": {
          id: "gpt-4.1",
          name: "GPT-4.1",
          family: "gpt",
          release_date: "2025-04-14",
          attachment: true,
          reasoning: false,
          temperature: true,
          tool_call: true,
          cost: { input: 2, output: 8, cache_read: 0.5 },
          limit: { context: 1000000, output: 32768 },
          modalities: { input: ["text", "image"], output: ["text"] },
        },
        "gpt-4.1-mini": {
          id: "gpt-4.1-mini",
          name: "GPT-4.1 Mini",
          family: "gpt-mini",
          release_date: "2025-04-14",
          attachment: true,
          reasoning: false,
          temperature: true,
          tool_call: true,
          cost: { input: 0.4, output: 1.6, cache_read: 0.1 },
          limit: { context: 1000000, output: 32768 },
          modalities: { input: ["text", "image"], output: ["text"] },
        },
        "gpt-4.1-nano": {
          id: "gpt-4.1-nano",
          name: "GPT-4.1 Nano",
          family: "gpt-nano",
          release_date: "2025-04-14",
          attachment: true,
          reasoning: false,
          temperature: true,
          tool_call: true,
          cost: { input: 0.1, output: 0.4, cache_read: 0.025 },
          limit: { context: 1000000, output: 32768 },
          modalities: { input: ["text", "image"], output: ["text"] },
        },
        "o3-mini": {
          id: "o3-mini",
          name: "o3-mini",
          family: "o3",
          release_date: "2025-01-31",
          attachment: false,
          reasoning: true,
          temperature: false,
          tool_call: true,
          cost: { input: 1.1, output: 4.4, cache_read: 0.275 },
          limit: { context: 200000, output: 100000 },
          modalities: { input: ["text"], output: ["text"] },
        },
        "gpt-4o": {
          id: "gpt-4o",
          name: "GPT-4o",
          family: "gpt",
          release_date: "2024-05-13",
          attachment: true,
          reasoning: false,
          temperature: true,
          tool_call: true,
          cost: { input: 2.5, output: 10, cache_read: 1.25 },
          limit: { context: 128000, output: 16384 },
          modalities: { input: ["text", "image"], output: ["text"] },
        },
        "gpt-4o-mini": {
          id: "gpt-4o-mini",
          name: "GPT-4o Mini",
          family: "gpt-mini",
          release_date: "2024-07-18",
          attachment: true,
          reasoning: false,
          temperature: true,
          tool_call: true,
          cost: { input: 0.15, output: 0.6, cache_read: 0.075 },
          limit: { context: 128000, output: 16384 },
          modalities: { input: ["text", "image"], output: ["text"] },
        },
      },
    },

    google: {
      id: "google",
      name: "Google",
      npm: "@ai-sdk/google",
      env: ["GOOGLE_GENERATIVE_AI_API_KEY"],
      models: {
        "gemini-2.5-pro": {
          id: "gemini-2.5-pro",
          name: "Gemini 2.5 Pro",
          family: "gemini-pro",
          release_date: "2025-03-25",
          attachment: true,
          reasoning: true,
          temperature: true,
          tool_call: true,
          cost: { input: 1.25, output: 10, cache_read: 0.31 },
          limit: { context: 1048576, output: 65536 },
          modalities: { input: ["text", "image", "audio", "video", "pdf"], output: ["text"] },
        },
        "gemini-2.5-flash": {
          id: "gemini-2.5-flash",
          name: "Gemini 2.5 Flash",
          family: "gemini-flash",
          release_date: "2025-04-17",
          attachment: true,
          reasoning: true,
          temperature: true,
          tool_call: true,
          cost: { input: 0.15, output: 0.6, cache_read: 0.0375 },
          limit: { context: 1048576, output: 65536 },
          modalities: { input: ["text", "image", "audio", "video", "pdf"], output: ["text"] },
        },
        "gemini-2.0-flash": {
          id: "gemini-2.0-flash",
          name: "Gemini 2.0 Flash",
          family: "gemini-flash",
          release_date: "2025-02-05",
          attachment: true,
          reasoning: false,
          temperature: true,
          tool_call: true,
          cost: { input: 0.1, output: 0.4, cache_read: 0.025 },
          limit: { context: 1048576, output: 8192 },
          modalities: { input: ["text", "image", "audio", "video", "pdf"], output: ["text"] },
        },
      },
    },
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Return all built-in providers with their models. */
  export function get(): Record<string, Provider> {
    return PROVIDERS
  }

  /** Get a single built-in provider by id. */
  export function getProvider(id: string): Provider | undefined {
    return PROVIDERS[id]
  }
}
