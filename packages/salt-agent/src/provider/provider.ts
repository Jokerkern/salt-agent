import z from "zod"
import type { LanguageModelV2 } from "@ai-sdk/provider"
import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { Config } from "../config/config.js"
import { Models } from "./models.js"
import { Auth } from "./auth.js"
import { NamedError } from "../util/error.js"
import { Log } from "../util/log.js"
import { lazy } from "../util/lazy.js"

/**
 * Provider namespace — core LLM provider management.
 * Aligned with opencode's Provider namespace.
 */
export namespace Provider {
  const log = Log.create({ service: "provider" })

  // ---------------------------------------------------------------------------
  // Types (Zod schemas)
  // ---------------------------------------------------------------------------

  export const Model = z.object({
    id: z.string(),
    providerID: z.string(),
    api: z.object({
      id: z.string(),
      url: z.string(),
      npm: z.string(),
    }),
    name: z.string(),
    family: z.string().optional(),
    capabilities: z.object({
      temperature: z.boolean(),
      reasoning: z.boolean(),
      attachment: z.boolean(),
      toolcall: z.boolean(),
      input: z.object({
        text: z.boolean(),
        image: z.boolean(),
        audio: z.boolean(),
        video: z.boolean(),
        pdf: z.boolean(),
      }),
      output: z.object({
        text: z.boolean(),
        image: z.boolean(),
        audio: z.boolean(),
        video: z.boolean(),
        pdf: z.boolean(),
      }),
    }),
    cost: z.object({
      input: z.number(),
      output: z.number(),
      cache: z.object({
        read: z.number(),
        write: z.number(),
      }),
    }),
    limit: z.object({
      context: z.number(),
      input: z.number().optional(),
      output: z.number(),
    }),
    status: z.enum(["alpha", "beta", "deprecated", "active"]),
    options: z.record(z.string(), z.any()),
    headers: z.record(z.string(), z.string()),
    release_date: z.string(),
  })
  export type Model = z.infer<typeof Model>

  export const Info = z.object({
    id: z.string(),
    name: z.string(),
    source: z.enum(["env", "config", "custom", "builtin"]),
    env: z.string().array(),
    key: z.string().optional(),
    options: z.record(z.string(), z.any()),
    models: z.record(z.string(), Model),
  })
  export type Info = z.infer<typeof Info>

  // ---------------------------------------------------------------------------
  // Errors
  // ---------------------------------------------------------------------------

  export const ModelNotFoundError = NamedError.create(
    "ProviderModelNotFoundError",
    z.object({
      providerID: z.string(),
      modelID: z.string(),
      suggestions: z.array(z.string()).optional(),
    }),
  )

  export const InitError = NamedError.create(
    "ProviderInitError",
    z.object({
      providerID: z.string(),
      message: z.string().optional(),
    }),
  )

  // ---------------------------------------------------------------------------
  // Bundled SDK providers
  // ---------------------------------------------------------------------------

  type SDK = { languageModel: (modelId: string) => LanguageModelV2 }

  const BUNDLED_PROVIDERS: Record<string, (options: Record<string, unknown>) => SDK> = {
    "@ai-sdk/openai": createOpenAI as unknown as (options: Record<string, unknown>) => SDK,
    "@ai-sdk/anthropic": createAnthropic as unknown as (options: Record<string, unknown>) => SDK,
    "@ai-sdk/google": createGoogleGenerativeAI as unknown as (options: Record<string, unknown>) => SDK,
    "@ai-sdk/openai-compatible": createOpenAICompatible as unknown as (options: Record<string, unknown>) => SDK,
  }

  // ---------------------------------------------------------------------------
  // Default API URLs
  // ---------------------------------------------------------------------------

  const DEFAULT_API_URLS: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com",
    google: "https://generativelanguage.googleapis.com/v1beta",
  }

  // ---------------------------------------------------------------------------
  // Internal state
  // ---------------------------------------------------------------------------

  interface State {
    providers: Record<string, Info>
    allProviders: Record<string, Info>
    sdkCache: Map<string, SDK>
    languageCache: Map<string, LanguageModelV2>
  }

  const state = lazy(async (): Promise<State> => {
    const cfg = await Config.get()
    const builtinProviders = Models.get()
    const providers: Record<string, Info> = {}

    // 1. Build provider list from static models
    for (const [id, bp] of Object.entries(builtinProviders)) {
      providers[id] = fromModelsProvider(bp)
    }

    // 2. Merge config providers (overrides + custom providers like openai-compatible)
    if (cfg.provider) {
      for (const [id, cfgProvider] of Object.entries(cfg.provider)) {
        if (providers[id]) {
          // Merge into existing provider
          mergeConfigProvider(providers[id], cfgProvider, id)
        } else {
          // New provider from config (e.g. openai-compatible)
          providers[id] = fromConfigProvider(id, cfgProvider)
        }
      }
    }

    // 3. Resolve API keys from config, persistent auth, and env (in priority order)
    const authData = await Auth.all()
    for (const [id, provider] of Object.entries(providers)) {
      // Priority 1: Config apiKey
      const cfgKey = cfg.provider?.[id]?.options?.apiKey
      if (typeof cfgKey === "string" && cfgKey) {
        provider.key = cfgKey
        provider.source = "config"
        continue
      }

      // Priority 2: Persistent auth (auth.json)
      const authInfo = authData[id]
      if (authInfo) {
        provider.key = Auth.extractKey(authInfo)
        provider.source = "config"
        continue
      }

      // Priority 3: Environment variables
      for (const envVar of provider.env) {
        const value = process.env[envVar]
        if (value) {
          provider.key = value
          provider.source = "env"
          break
        }
      }
    }

    // 4. Keep a copy of all providers (including those without keys) for UI listing
    const allProviders = { ...providers }

    // 5. Remove providers without API keys from active set (no models available)
    for (const [id, provider] of Object.entries(providers)) {
      if (!provider.key && Object.keys(provider.models).length > 0) {
        log.info("skipping provider (no API key)", { provider: id, env: provider.env })
        delete providers[id]
      }
    }

    log.info("providers loaded", {
      available: Object.keys(providers),
      total: Object.keys(allProviders).length,
    })

    return {
      providers,
      allProviders,
      sdkCache: new Map(),
      languageCache: new Map(),
    }
  })

  // ---------------------------------------------------------------------------
  // Conversion helpers
  // ---------------------------------------------------------------------------

  function fromModelsProvider(bp: Models.Provider): Info {
    const models: Record<string, Model> = {}
    for (const [modelId, m] of Object.entries(bp.models)) {
      models[modelId] = fromModelsModel(bp, m)
    }
    return {
      id: bp.id,
      name: bp.name,
      source: "builtin",
      env: bp.env,
      options: {},
      models,
    }
  }

  function fromModelsModel(provider: Models.Provider, m: Models.Model): Model {
    const modalities = m.modalities ?? { input: ["text"], output: ["text"] }
    return {
      id: m.id,
      providerID: provider.id,
      api: {
        id: m.id,
        url: provider.api ?? DEFAULT_API_URLS[provider.id] ?? "",
        npm: provider.npm,
      },
      name: m.name,
      family: m.family,
      capabilities: {
        temperature: m.temperature,
        reasoning: m.reasoning,
        attachment: m.attachment,
        toolcall: m.tool_call,
        input: {
          text: modalities.input.includes("text"),
          image: modalities.input.includes("image"),
          audio: modalities.input.includes("audio"),
          video: modalities.input.includes("video"),
          pdf: modalities.input.includes("pdf"),
        },
        output: {
          text: modalities.output.includes("text"),
          image: modalities.output.includes("image"),
          audio: modalities.output.includes("audio"),
          video: modalities.output.includes("video"),
          pdf: modalities.output.includes("pdf"),
        },
      },
      cost: {
        input: m.cost?.input ?? 0,
        output: m.cost?.output ?? 0,
        cache: {
          read: m.cost?.cache_read ?? 0,
          write: m.cost?.cache_write ?? 0,
        },
      },
      limit: {
        context: m.limit.context,
        input: m.limit.input,
        output: m.limit.output,
      },
      status: m.status ?? "active",
      options: m.options ?? {},
      headers: m.headers ?? {},
      release_date: m.release_date,
    }
  }

  function fromConfigProvider(id: string, cfg: Config.Provider): Info {
    const models: Record<string, Model> = {}
    if (cfg.models) {
      for (const [modelId, modelCfg] of Object.entries(cfg.models)) {
        models[modelId] = {
          id: modelId,
          providerID: id,
          api: {
            id: modelId,
            url: cfg.options?.baseURL ?? "",
            npm: cfg.npm ?? "@ai-sdk/openai-compatible",
          },
          name: (modelCfg as Record<string, unknown>).name as string ?? modelId,
          capabilities: {
            temperature: true,
            reasoning: false,
            attachment: false,
            toolcall: true,
            input: { text: true, image: false, audio: false, video: false, pdf: false },
            output: { text: true, image: false, audio: false, video: false, pdf: false },
          },
          cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
          limit: {
            context: (modelCfg as Record<string, unknown>).context as number ?? 128000,
            output: (modelCfg as Record<string, unknown>).output as number ?? 8192,
          },
          status: "active",
          options: {},
          headers: {},
          release_date: "",
        }
      }
    }
    return {
      id,
      name: cfg.name ?? id,
      source: "config",
      env: cfg.env ?? [],
      options: cfg.options ?? {},
      models,
    }
  }

  function mergeConfigProvider(provider: Info, cfg: Config.Provider, id: string): void {
    // Merge options (apiKey, baseURL, etc.)
    if (cfg.options) {
      provider.options = { ...provider.options, ...cfg.options }
      // Update API URLs if baseURL changed
      if (cfg.options.baseURL) {
        for (const model of Object.values(provider.models)) {
          model.api.url = cfg.options.baseURL
        }
      }
    }

    // Override name
    if (cfg.name) provider.name = cfg.name

    // Override env
    if (cfg.env) provider.env = cfg.env

    // Override npm
    if (cfg.npm) {
      for (const model of Object.values(provider.models)) {
        model.api.npm = cfg.npm
      }
    }

    // Merge additional models from config
    if (cfg.models) {
      for (const [modelId, modelCfg] of Object.entries(cfg.models)) {
        if (!provider.models[modelId]) {
          provider.models[modelId] = {
            id: modelId,
            providerID: id,
            api: {
              id: modelId,
              url: cfg.options?.baseURL ?? provider.models[Object.keys(provider.models)[0] ?? ""]?.api.url ?? "",
              npm: cfg.npm ?? provider.models[Object.keys(provider.models)[0] ?? ""]?.api.npm ?? "",
            },
            name: (modelCfg as Record<string, unknown>).name as string ?? modelId,
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
            status: "active",
            options: {},
            headers: {},
            release_date: "",
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // SDK management
  // ---------------------------------------------------------------------------

  async function getSDK(model: Model): Promise<SDK> {
    const s = await state()
    const provider = s.providers[model.providerID]
    if (!provider) {
      throw new InitError({ providerID: model.providerID, message: "provider not found" })
    }

    // Build options for SDK creation
    const options: Record<string, unknown> = { ...provider.options }
    if (provider.key) options.apiKey = provider.key
    if (model.api.url) options.baseURL = model.api.url

    // Merge model-level headers
    if (Object.keys(model.headers).length > 0) {
      options.headers = { ...options.headers as Record<string, string> ?? {}, ...model.headers }
    }

    // For openai-compatible, include usage info
    if (model.api.npm === "@ai-sdk/openai-compatible") {
      if (options.includeUsage === undefined) {
        options.includeUsage = true
      }
    }

    // Cache key based on provider + options
    const cacheKey = JSON.stringify({ providerID: model.providerID, npm: model.api.npm, options })
    if (s.sdkCache.has(cacheKey)) return s.sdkCache.get(cacheKey)!

    // Create SDK
    const createFn = BUNDLED_PROVIDERS[model.api.npm]
    if (!createFn) {
      throw new InitError({
        providerID: model.providerID,
        message: `unsupported SDK package: ${model.api.npm}`,
      })
    }

    try {
      const sdk = createFn(options)
      s.sdkCache.set(cacheKey, sdk)
      log.info("created SDK", { provider: model.providerID, npm: model.api.npm })
      return sdk
    } catch (e) {
      throw new InitError(
        { providerID: model.providerID, message: (e as Error).message },
        { cause: e },
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Parse a "provider/model" string into its components.
   * Splits on the first "/" only: "openai/gpt-4.1" → { providerID: "openai", modelID: "gpt-4.1" }
   */
  export function parseModel(input: string): { providerID: string; modelID: string } {
    const idx = input.indexOf("/")
    if (idx === -1) {
      throw new Error(`Invalid model format: "${input}". Expected "provider/model".`)
    }
    return {
      providerID: input.slice(0, idx),
      modelID: input.slice(idx + 1),
    }
  }

  /** Return all available providers (only those with API keys configured). */
  export async function list(): Promise<Record<string, Info>> {
    const s = await state()
    return s.providers
  }

  /** Return all known providers, including those without API keys. */
  export async function listAll(): Promise<Record<string, Info>> {
    const s = await state()
    return s.allProviders
  }

  /** Get a single provider by ID. */
  export async function getProvider(providerID: string): Promise<Info | undefined> {
    const s = await state()
    return s.providers[providerID]
  }

  /** Get a model definition by provider and model ID. */
  export async function getModel(providerID: string, modelID: string): Promise<Model> {
    const s = await state()
    const provider = s.providers[providerID]
    if (!provider) {
      throw new ModelNotFoundError({ providerID, modelID })
    }
    const model = provider.models[modelID]
    if (!model) {
      const suggestions = Object.keys(provider.models).slice(0, 5)
      throw new ModelNotFoundError({ providerID, modelID, suggestions })
    }
    return model
  }

  /**
   * Get a LanguageModelV2 instance for the given model.
   * This is the main entry point for obtaining an AI SDK language model
   * that can be used with streamText / generateText.
   */
  export async function getLanguage(model: Model): Promise<LanguageModelV2> {
    const s = await state()
    const key = `${model.providerID}/${model.id}`
    if (s.languageCache.has(key)) return s.languageCache.get(key)!

    const sdk = await getSDK(model)

    try {
      const language = sdk.languageModel(model.api.id)
      s.languageCache.set(key, language)
      log.info("created language model", { provider: model.providerID, model: model.id })
      return language
    } catch (e) {
      throw new ModelNotFoundError(
        { providerID: model.providerID, modelID: model.id },
        { cause: e },
      )
    }
  }

  /**
   * Get the default model from config.
   * Returns the parsed providerID + modelID, or a sensible default.
   */
  export async function defaultModel(): Promise<{ providerID: string; modelID: string }> {
    const cfg = await Config.get()
    if (cfg.model) {
      return parseModel(cfg.model)
    }

    // Try to find the first available provider with models
    const s = await state()
    for (const provider of Object.values(s.providers)) {
      const models = Object.keys(provider.models)
      if (models.length > 0) {
        return { providerID: provider.id, modelID: models[0]! }
      }
    }

    throw new Error("No providers configured. Please set an API key.")
  }

  /** Sort models by priority: active > beta > alpha > deprecated, then by name. */
  export function sort(models: Model[]): Model[] {
    const priority: Record<string, number> = { active: 0, beta: 1, alpha: 2, deprecated: 3 }
    return [...models].sort((a, b) => {
      const pa = priority[a.status] ?? 99
      const pb = priority[b.status] ?? 99
      if (pa !== pb) return pa - pb
      return a.name.localeCompare(b.name)
    })
  }

  /**
   * Calculate token usage cost for a given model.
   * All costs are per million tokens; this returns the cost in the same currency unit.
   */
  export function calculateCost(
    model: Model,
    usage: {
      inputTokens: number
      outputTokens: number
      reasoningTokens?: number
      cacheReadTokens?: number
      cacheWriteTokens?: number
    },
  ): number {
    const { inputTokens, outputTokens, reasoningTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0 } = usage
    return (
      (inputTokens * model.cost.input +
        outputTokens * model.cost.output +
        reasoningTokens * model.cost.output +
        cacheReadTokens * model.cost.cache.read +
        cacheWriteTokens * model.cost.cache.write) /
      1_000_000
    )
  }

  /** Reset cached state. For testing only. */
  export function reset() {
    state.reset()
  }
}
