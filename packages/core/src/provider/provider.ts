import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { LanguageModel } from "ai"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyLanguageModel = any
import { eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import { getDb, schema } from "../storage/db.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProviderInfo {
  id: string
  name: string
  description: string
  envKey?: string
  factory: (options: ProviderOptions) => ProviderInstance
}

export interface ProviderOptions {
  apiKey?: string
  baseUrl?: string
  options?: Record<string, unknown>
}

export interface ProviderInstance {
  languageModel(modelId: string): AnyLanguageModel
}

export interface ProviderConfig {
  id: string
  providerId: string
  name: string
  apiKey?: string
  baseUrl?: string
  modelId?: string
  options?: Record<string, unknown>
  isDefault: boolean
  createdAt: number
  updatedAt: number
}

export interface ModelInfo {
  id: string
  name: string
  providerId: string
}

// ---------------------------------------------------------------------------
// Built-in Provider Registry
// ---------------------------------------------------------------------------

const BUILTIN_PROVIDERS: Record<string, ProviderInfo> = {
  openai: {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o, GPT-4o-mini, o1, o3, etc.",
    envKey: "OPENAI_API_KEY",
    factory: (opts) => {
      const provider = createOpenAI({
        apiKey: opts.apiKey || process.env["OPENAI_API_KEY"],
        baseURL: opts.baseUrl,
      })
      return {
        languageModel: (modelId: string) => provider(modelId),
      }
    },
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude 4, Claude Sonnet, Claude Haiku, etc.",
    envKey: "ANTHROPIC_API_KEY",
    factory: (opts) => {
      const provider = createAnthropic({
        apiKey: opts.apiKey || process.env["ANTHROPIC_API_KEY"],
        baseURL: opts.baseUrl,
      })
      return {
        languageModel: (modelId: string) => provider(modelId),
      }
    },
  },
  google: {
    id: "google",
    name: "Google",
    description: "Gemini 2.5 Flash, Gemini 2.5 Pro, etc.",
    envKey: "GEMINI_API_KEY",
    factory: (opts) => {
      const provider = createGoogleGenerativeAI({
        apiKey: opts.apiKey || process.env["GEMINI_API_KEY"],
        baseURL: opts.baseUrl,
      })
      return {
        languageModel: (modelId: string) => provider(modelId),
      }
    },
  },
  "openai-compatible": {
    id: "openai-compatible",
    name: "OpenAI Compatible",
    description: "Any OpenAI-compatible API (Ollama, vLLM, LM Studio, etc.)",
    factory: (opts) => {
      if (!opts.baseUrl) throw new Error("baseUrl is required for openai-compatible provider")
      // Use @ai-sdk/openai-compatible which properly handles system role
      // instead of developer role for old-style OpenAI-compatible endpoints
      const provider = createOpenAICompatible({
        apiKey: opts.apiKey || "dummy",
        baseURL: opts.baseUrl,
        name: "custom",
      })
      return {
        languageModel: (modelId: string) => provider(modelId),
      }
    },
  },
}

// ---------------------------------------------------------------------------
// Provider Registry Functions
// ---------------------------------------------------------------------------

/** List all built-in provider definitions */
export function listProviders(): ProviderInfo[] {
  return Object.values(BUILTIN_PROVIDERS)
}

/** Get a built-in provider definition by ID */
export function getProviderInfo(providerId: string): ProviderInfo | undefined {
  return BUILTIN_PROVIDERS[providerId]
}

/**
 * Resolve a language model from provider config.
 * Looks up the provider config from DB, instantiates the provider, and returns the model.
 */
export function resolveModel(config: ProviderConfig, modelId?: string): LanguageModel {
  const info = BUILTIN_PROVIDERS[config.providerId]
  if (!info) throw new Error(`Unknown provider: ${config.providerId}`)

  const instance = info.factory({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    options: config.options,
  })

  const resolvedModelId = modelId || config.modelId
  if (!resolvedModelId) throw new Error("No model ID specified")

  return instance.languageModel(resolvedModelId)
}

/**
 * Get the default provider config, or the first available one.
 */
export function getDefaultProviderConfig(): ProviderConfig | undefined {
  const db = getDb()

  // Try default first
  const defaultRow = db
    .select()
    .from(schema.provider_config)
    .where(eq(schema.provider_config.is_default, 1))
    .get()

  const row = defaultRow || db.select().from(schema.provider_config).get()
  if (!row) return undefined

  return rowToConfig(row)
}

// ---------------------------------------------------------------------------
// Provider Config CRUD
// ---------------------------------------------------------------------------

export function listProviderConfigs(): ProviderConfig[] {
  const db = getDb()
  const rows = db.select().from(schema.provider_config).all()
  return rows.map(rowToConfig)
}

export function getProviderConfig(id: string): ProviderConfig | undefined {
  const db = getDb()
  const row = db.select().from(schema.provider_config).where(eq(schema.provider_config.id, id)).get()
  if (!row) return undefined
  return rowToConfig(row)
}

export function createProviderConfig(input: {
  providerId: string
  name: string
  apiKey?: string
  baseUrl?: string
  modelId?: string
  options?: Record<string, unknown>
  isDefault?: boolean
}): ProviderConfig {
  const db = getDb()
  const now = Date.now()
  const id = nanoid()

  // If this is the first config or explicitly default, clear other defaults
  if (input.isDefault) {
    db.update(schema.provider_config)
      .set({ is_default: 0, updated_at: now })
      .run()
  }

  const existing = db.select().from(schema.provider_config).all()
  const isDefault = input.isDefault || existing.length === 0

  db.insert(schema.provider_config)
    .values({
      id,
      provider_id: input.providerId,
      name: input.name,
      api_key: input.apiKey ?? null,
      base_url: input.baseUrl ?? null,
      model_id: input.modelId ?? null,
      options: input.options ? JSON.stringify(input.options) : null,
      is_default: isDefault ? 1 : 0,
      created_at: now,
      updated_at: now,
    })
    .run()

  return {
    id,
    providerId: input.providerId,
    name: input.name,
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
    modelId: input.modelId,
    options: input.options,
    isDefault,
    createdAt: now,
    updatedAt: now,
  }
}

export function updateProviderConfig(
  id: string,
  input: Partial<{
    name: string
    apiKey: string
    baseUrl: string
    modelId: string
    options: Record<string, unknown>
    isDefault: boolean
  }>,
): ProviderConfig | undefined {
  const db = getDb()
  const now = Date.now()

  const existing = db.select().from(schema.provider_config).where(eq(schema.provider_config.id, id)).get()
  if (!existing) return undefined

  if (input.isDefault) {
    db.update(schema.provider_config)
      .set({ is_default: 0, updated_at: now })
      .run()
  }

  db.update(schema.provider_config)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.apiKey !== undefined && { api_key: input.apiKey }),
      ...(input.baseUrl !== undefined && { base_url: input.baseUrl }),
      ...(input.modelId !== undefined && { model_id: input.modelId }),
      ...(input.options !== undefined && { options: JSON.stringify(input.options) }),
      ...(input.isDefault !== undefined && { is_default: input.isDefault ? 1 : 0 }),
      updated_at: now,
    })
    .where(eq(schema.provider_config.id, id))
    .run()

  return getProviderConfig(id)
}

export function deleteProviderConfig(id: string): boolean {
  const db = getDb()
  const result = db.delete(schema.provider_config).where(eq(schema.provider_config.id, id)).run()
  return result.changes > 0
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToConfig(row: typeof schema.provider_config.$inferSelect): ProviderConfig {
  return {
    id: row.id,
    providerId: row.provider_id,
    name: row.name,
    apiKey: row.api_key ?? undefined,
    baseUrl: row.base_url ?? undefined,
    modelId: row.model_id ?? undefined,
    options: row.options ? JSON.parse(row.options) : undefined,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
