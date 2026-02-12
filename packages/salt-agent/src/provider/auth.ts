import path from "path"
import fs from "fs/promises"
import z from "zod"
import { Global } from "../global/global.js"
import { Log } from "../util/log.js"
import { NamedError } from "../util/error.js"
import { BusEvent } from "../bus/bus-event.js"
import { Bus } from "../bus/bus.js"

/**
 * Auth namespace — persistent credential storage for LLM providers.
 * Stores API keys and OAuth tokens in `{dataDir}/auth.json`.
 * Aligned with opencode's Auth namespace (adapted from Bun to Node.js fs).
 */
export namespace Auth {
  const log = Log.create({ service: "auth" })

  // ---------------------------------------------------------------------------
  // Types (Zod schemas)
  // ---------------------------------------------------------------------------

  /** OAuth credential (access + refresh tokens with expiry). */
  export const Oauth = z.object({
    type: z.literal("oauth"),
    refresh: z.string(),
    access: z.string(),
    expires: z.number(),
    accountId: z.string().optional(),
  })

  /** Simple API key credential. */
  export const Api = z.object({
    type: z.literal("api"),
    key: z.string(),
  })

  /** Discriminated union of all credential types. */
  export const Info = z.discriminatedUnion("type", [Oauth, Api])
  export type Info = z.infer<typeof Info>

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  export const Event = {
    Updated: BusEvent.define(
      "auth.updated",
      z.object({
        providerID: z.string(),
      }),
    ),
  }

  // ---------------------------------------------------------------------------
  // Errors
  // ---------------------------------------------------------------------------

  export const NotFoundError = NamedError.create(
    "AuthNotFoundError",
    z.object({
      providerID: z.string(),
    }),
  )

  export const OauthMissingError = NamedError.create(
    "AuthOauthMissingError",
    z.object({
      providerID: z.string(),
    }),
  )

  export const OauthCallbackFailedError = NamedError.create(
    "AuthOauthCallbackFailedError",
    z.object({}),
  )

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  function filepath(): string {
    return path.join(Global.Path.data, "auth.json")
  }

  async function readFile(): Promise<Record<string, unknown>> {
    try {
      const text = await fs.readFile(filepath(), "utf-8")
      return JSON.parse(text) as Record<string, unknown>
    } catch {
      return {}
    }
  }

  async function writeFile(data: Record<string, Info>): Promise<void> {
    const file = filepath()
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, JSON.stringify(data, null, 2), { mode: 0o600 })
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Get the credential for a specific provider.
   * Returns undefined if no credential is stored.
   */
  export async function get(providerID: string): Promise<Info | undefined> {
    const data = await all()
    return data[providerID]
  }

  /**
   * Get all stored credentials, keyed by provider ID.
   * Invalid entries are silently skipped.
   */
  export async function all(): Promise<Record<string, Info>> {
    const raw = await readFile()
    const result: Record<string, Info> = {}
    for (const [key, value] of Object.entries(raw)) {
      const parsed = Info.safeParse(value)
      if (parsed.success) {
        result[key] = parsed.data
      }
    }
    return result
  }

  /**
   * Store or update a credential for a provider.
   * Writes to disk immediately and publishes an auth.updated event.
   */
  export async function set(providerID: string, info: Info): Promise<void> {
    const data = await all()
    data[providerID] = info
    await writeFile(data)
    log.info("saved credential", { provider: providerID, type: info.type })
    await Bus.publish(Event.Updated, { providerID })
  }

  /**
   * Remove a credential for a provider.
   * Writes to disk immediately and publishes an auth.updated event.
   */
  export async function remove(providerID: string): Promise<void> {
    const data = await all()
    if (!(providerID in data)) return
    delete data[providerID]
    await writeFile(data)
    log.info("removed credential", { provider: providerID })
    await Bus.publish(Event.Updated, { providerID })
  }

  /**
   * Extract the API key string from a credential.
   * For API type, returns the key directly.
   * For OAuth type, returns the access token.
   */
  export function extractKey(info: Info): string {
    switch (info.type) {
      case "api":
        return info.key
      case "oauth":
        return info.access
    }
  }

  /**
   * Check if an OAuth credential has expired.
   * Returns true if the credential is expired or will expire within the given buffer (ms).
   */
  export function isExpired(info: Info, bufferMs = 60_000): boolean {
    if (info.type !== "oauth") return false
    return Date.now() + bufferMs >= info.expires
  }
}
