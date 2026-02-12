import path from "path"
import fs from "fs/promises"
import z from "zod"
import { Global } from "../global/global.js"
import { lazy } from "../util/lazy.js"
import { NamedError } from "../util/error.js"
import { BusEvent } from "../bus/bus-event.js"
import { Bus } from "../bus/bus.js"
import { Log } from "../util/log.js"

export namespace Config {
  const log = Log.create({ service: "config" })

  // ---------------------------------------------------------------------------
  // Schema  (aligned with opencode)
  // ---------------------------------------------------------------------------

  /** Provider options – apiKey / baseURL live here, matches opencode's `provider.*.options`. */
  export const ProviderOptions = z
    .object({
      apiKey: z.string().optional(),
      baseURL: z.string().optional(),
    })
    .catchall(z.any())

  export type ProviderOptions = z.infer<typeof ProviderOptions>

  /** Per-provider configuration (aligned with opencode's Config.Provider). */
  export const Provider = z
    .object({
      /** Display name for this provider. */
      name: z.string().optional(),
      /** Environment variable names for API key lookup. */
      env: z.array(z.string()).optional(),
      /** NPM package name for the AI SDK provider (e.g. "@ai-sdk/openai-compatible"). */
      npm: z.string().optional(),
      /** API base URL alias. */
      api: z.string().optional(),
      /** Provider options (apiKey, baseURL, etc.). */
      options: ProviderOptions.optional(),
      /** Per-model overrides or additional models. */
      models: z
        .record(z.string(), z.object({}).catchall(z.any()))
        .optional(),
    })
    .strict()

  export type Provider = z.infer<typeof Provider>

  /** Top-level config schema. */
  export const Info = z
    .object({
      /** Default model in "provider/model" format, e.g. "anthropic/claude-sonnet-4-20250514". */
      model: z.string().optional(),
      /** Default small model for auxiliary tasks (title generation, etc.). */
      small_model: z.string().optional(),
      /** Per-provider settings keyed by provider id (e.g. "openai", "anthropic"). */
      provider: z.record(z.string(), Provider).optional(),
    })
    .strict()

  export type Info = z.infer<typeof Info>

  // ---------------------------------------------------------------------------
  // Errors
  // ---------------------------------------------------------------------------

  export const InvalidError = NamedError.create(
    "ConfigInvalidError",
    z.object({
      path: z.string(),
      issues: z.array(z.any()).optional(),
      message: z.string().optional(),
    }),
  )

  export const NotFoundError = NamedError.create(
    "ConfigNotFoundError",
    z.object({
      path: z.string(),
    }),
  )

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  export const Event = {
    Updated: BusEvent.define(
      "config.updated",
      z.object({
        config: Info,
      }),
    ),
  }

  // ---------------------------------------------------------------------------
  // Deep merge  (aligned with opencode's remeda mergeDeep)
  // ---------------------------------------------------------------------------

  function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }

  /** Recursively merge `patch` into `base`. Arrays are replaced, not concatenated. */
  function mergeDeep<T extends Record<string, unknown>>(base: T, patch: Partial<T>): T {
    const result = { ...base } as Record<string, unknown>
    for (const key of Object.keys(patch)) {
      const baseVal = result[key]
      const patchVal = (patch as Record<string, unknown>)[key]
      if (isPlainObject(baseVal) && isPlainObject(patchVal)) {
        result[key] = mergeDeep(baseVal, patchVal)
      } else if (patchVal !== undefined) {
        result[key] = patchVal
      }
    }
    return result as T
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  function filepath(): string {
    return path.join(Global.Path.config, "salt-agent.json")
  }

  const state = lazy(async () => {
    const file = filepath()
    let text: string | undefined
    try {
      text = await fs.readFile(file, "utf-8")
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e
    }

    // First run – create default config
    if (!text) {
      const defaults: Info = {}
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, JSON.stringify(defaults, null, 2))
      log.info("created default config", { path: file })
      return defaults
    }

    // Parse & validate
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch (e) {
      throw new InvalidError({
        path: file,
        message: `Invalid JSON: ${(e as Error).message}`,
      })
    }

    const parsed = Info.safeParse(raw)
    if (!parsed.success) {
      throw new InvalidError({
        path: file,
        issues: parsed.error.issues,
        message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      })
    }

    log.info("loaded config", { path: file })
    return parsed.data
  })

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Load config (cached after first call). Returns validated config or throws. */
  export async function get(): Promise<Info> {
    return state()
  }

  /**
   * Deep-merge `patch` into the current config, write to disk, invalidate cache,
   * and publish a config.updated event.
   */
  export async function save(patch: Info): Promise<Info> {
    const current = await get()
    const merged = mergeDeep(current as Record<string, unknown>, patch as Record<string, unknown>)

    // Validate the merged result
    const parsed = Info.safeParse(merged)
    if (!parsed.success) {
      throw new InvalidError({
        path: filepath(),
        issues: parsed.error.issues,
        message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      })
    }

    const file = filepath()
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, JSON.stringify(parsed.data, null, 2))

    // Invalidate cache so next get() reloads from disk
    state.reset()

    log.info("saved config", { path: file })
    await Bus.publish(Event.Updated, { config: parsed.data })
    return parsed.data
  }

  /** Reset cached state. For testing only. */
  export function reset() {
    state.reset()
  }
}
