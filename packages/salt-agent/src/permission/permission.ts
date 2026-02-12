import z from "zod"
import os from "os"
import { Bus } from "../bus/bus.js"
import { BusEvent } from "../bus/bus-event.js"
import { Identifier } from "../id/id.js"
import { Log } from "../util/log.js"
import { Wildcard } from "../util/wildcard.js"

/**
 * Permission system for tool execution.
 * Simplified from opencode's PermissionNext for salt-agent's single-project design.
 */
export namespace Permission {
  const log = Log.create({ service: "permission" })

  function expand(pattern: string): string {
    if (pattern.startsWith("~/")) return os.homedir() + pattern.slice(1)
    if (pattern === "~") return os.homedir()
    if (pattern.startsWith("$HOME/")) return os.homedir() + pattern.slice(5)
    if (pattern.startsWith("$HOME")) return os.homedir() + pattern.slice(5)
    return pattern
  }

  // ---------------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------------

  export const Action = z.enum(["allow", "deny", "ask"])
  export type Action = z.infer<typeof Action>

  export const Rule = z.object({
    permission: z.string(),
    pattern: z.string(),
    action: Action,
  })
  export type Rule = z.infer<typeof Rule>

  export const Ruleset = Rule.array()
  export type Ruleset = z.infer<typeof Ruleset>

  export const Request = z.object({
    id: z.string(),
    sessionID: z.string(),
    permission: z.string(),
    patterns: z.string().array(),
    metadata: z.record(z.string(), z.any()),
    always: z.string().array(),
    tool: z
      .object({
        messageID: z.string(),
        callID: z.string(),
      })
      .optional(),
  })
  export type Request = z.infer<typeof Request>

  export const Reply = z.enum(["once", "always", "reject"])
  export type Reply = z.infer<typeof Reply>

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  export const Event = {
    Asked: BusEvent.define("permission.asked", Request),
    Replied: BusEvent.define(
      "permission.replied",
      z.object({
        sessionID: z.string(),
        requestID: z.string(),
        reply: Reply,
      }),
    ),
  }

  // ---------------------------------------------------------------------------
  // State (module-level, single-project)
  // ---------------------------------------------------------------------------

  const pending: Record<
    string,
    {
      info: Request
      resolve: () => void
      reject: (e: any) => void
    }
  > = {}

  const approved: Ruleset = []

  // ---------------------------------------------------------------------------
  // Core
  // ---------------------------------------------------------------------------

  export function fromConfig(permission: Record<string, string | Record<string, Action>>): Ruleset {
    const ruleset: Ruleset = []
    for (const [key, value] of Object.entries(permission)) {
      if (typeof value === "string") {
        ruleset.push({
          permission: key,
          action: value as Action,
          pattern: "*",
        })
        continue
      }
      ruleset.push(
        ...Object.entries(value).map(([pattern, action]) => ({
          permission: key,
          pattern: expand(pattern),
          action,
        })),
      )
    }
    return ruleset
  }

  export function merge(...rulesets: Ruleset[]): Ruleset {
    return rulesets.flat()
  }

  export function evaluate(permission: string, pattern: string, ...rulesets: Ruleset[]): Rule {
    const merged = merge(...rulesets)
    let match: Rule | undefined
    for (const rule of merged) {
      if (
        Wildcard.match(permission, rule.permission) &&
        Wildcard.match(pattern, rule.pattern)
      ) {
        match = rule
      }
    }
    return match ?? { action: "ask", permission, pattern: "*" }
  }

  export async function ask(input: {
    sessionID: string
    permission: string
    patterns: string[]
    metadata: Record<string, any>
    always: string[]
    tool?: { messageID: string; callID: string }
    ruleset?: Ruleset
  }) {
    const ruleset = input.ruleset ?? []
    for (const pattern of input.patterns ?? []) {
      const rule = evaluate(input.permission, pattern, ruleset, approved)
      log.info("evaluated", { permission: input.permission, pattern, action: rule.action })
      if (rule.action === "deny") {
        throw new DeniedError(ruleset.filter((r) => Wildcard.match(input.permission, r.permission)))
      }
      if (rule.action === "ask") {
        const id = Identifier.ascending("permission")
        return new Promise<void>((resolve, reject) => {
          const info: Request = {
            id,
            sessionID: input.sessionID,
            permission: input.permission,
            patterns: input.patterns,
            metadata: input.metadata,
            always: input.always,
            tool: input.tool,
          }
          pending[id] = { info, resolve, reject }
          Bus.publish(Event.Asked, info)
        })
      }
      // action === "allow" → continue
    }
  }

  export function reply(input: { requestID: string; reply: Reply; message?: string }) {
    log.info("response", input)
    const existing = pending[input.requestID]
    if (!existing) return
    delete pending[input.requestID]
    Bus.publish(Event.Replied, {
      sessionID: existing.info.sessionID,
      requestID: existing.info.id,
      reply: input.reply,
    })
    if (input.reply === "reject") {
      existing.reject(input.message ? new CorrectedError(input.message) : new RejectedError())
      // Reject all other pending permissions for this session
      const sessionID = existing.info.sessionID
      for (const [id, p] of Object.entries(pending)) {
        if (p.info.sessionID === sessionID) {
          delete pending[id]
          Bus.publish(Event.Replied, {
            sessionID: p.info.sessionID,
            requestID: p.info.id,
            reply: "reject",
          })
          p.reject(new RejectedError())
        }
      }
      return
    }
    if (input.reply === "once") {
      existing.resolve()
      return
    }
    if (input.reply === "always") {
      for (const pattern of existing.info.always) {
        approved.push({
          permission: existing.info.permission,
          pattern,
          action: "allow",
        })
      }
      existing.resolve()
      // Auto-resolve other pending permissions for this session that now pass
      const sessionID = existing.info.sessionID
      for (const [id, p] of Object.entries(pending)) {
        if (p.info.sessionID !== sessionID) continue
        const ok = p.info.patterns.every(
          (pattern) => evaluate(p.info.permission, pattern, approved).action === "allow",
        )
        if (!ok) continue
        delete pending[id]
        Bus.publish(Event.Replied, {
          sessionID: p.info.sessionID,
          requestID: p.info.id,
          reply: "always",
        })
        p.resolve()
      }
      return
    }
  }

  export function list() {
    return Object.values(pending).map((x) => x.info)
  }

  // ---------------------------------------------------------------------------
  // Errors
  // ---------------------------------------------------------------------------

  /** User rejected without message */
  export class RejectedError extends Error {
    constructor() {
      super("The user rejected permission to use this specific tool call.")
    }
  }

  /** User rejected with message — continues with guidance */
  export class CorrectedError extends Error {
    constructor(message: string) {
      super(
        `The user rejected permission to use this specific tool call with the following feedback: ${message}`,
      )
    }
  }

  /** Auto-rejected by config rule */
  export class DeniedError extends Error {
    constructor(public readonly ruleset: Ruleset) {
      super(
        `The user has specified a rule which prevents you from using this specific tool call. Here are some of the relevant rules ${JSON.stringify(ruleset)}`,
      )
    }
  }
}
