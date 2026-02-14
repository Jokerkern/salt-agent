import z from "zod"
import { BusEvent } from "../bus/bus-event.js"
import { Bus } from "../bus/bus.js"
import { Identifier } from "../id/id.js"
import { Storage } from "../storage/storage.js"
import { fn } from "../util/fn.js"
import { Log } from "../util/log.js"
import { MessageV2 } from "./message.js"
import type { Provider } from "../provider/provider.js"

export namespace Session {
  const log = Log.create({ service: "session" })

  const defaultTitlePrefix = "New session - "

  function createDefaultTitle() {
    return defaultTitlePrefix + new Date().toISOString()
  }

  export function isDefaultTitle(title: string) {
    return new RegExp(`^${defaultTitlePrefix}\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$`).test(title)
  }

  // ---------------------------------------------------------------------------
  // Info type
  // ---------------------------------------------------------------------------

  export const Info = z.object({
    id: Identifier.schema("session"),
    title: z.string(),
    parentID: z.string().optional(),
    permission: z.array(z.object({
      permission: z.string(),
      pattern: z.string(),
      action: z.enum(["allow", "deny", "ask"]),
    })).optional(),
    time: z.object({
      created: z.number(),
      updated: z.number(),
    }),
  })
  export type Info = z.infer<typeof Info>

  export class BusyError extends Error {
    constructor(public readonly sessionID: string) {
      super(`会话 ${sessionID} 正在忙碌中`)
    }
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  export const Event = {
    Created: BusEvent.define(
      "session.created",
      z.object({
        info: Info,
      }),
    ),
    Updated: BusEvent.define(
      "session.updated",
      z.object({
        info: Info,
      }),
    ),
    Deleted: BusEvent.define(
      "session.deleted",
      z.object({
        info: Info,
      }),
    ),
    Error: BusEvent.define(
      "session.error",
      z.object({
        sessionID: z.string(),
        error: z.any(),
      }),
    ),
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  export const create = fn(
    z
      .object({
        title: z.string().optional(),
        parentID: z.string().optional(),
        permission: z.array(z.object({
          permission: z.string(),
          pattern: z.string(),
          action: z.enum(["allow", "deny", "ask"]),
        })).optional(),
      })
      .optional(),
    async (input) => {
      const result: Info = {
        id: Identifier.descending("session"),
        title: input?.title ?? createDefaultTitle(),
        parentID: input?.parentID,
        permission: input?.permission,
        time: {
          created: Date.now(),
          updated: Date.now(),
        },
      }
      log.info("created", { id: result.id })
      await Storage.write(["session", result.id], result)
      Bus.publish(Event.Created, { info: result })
      Bus.publish(Event.Updated, { info: result })
      return result
    },
  )

  export const get = fn(Identifier.schema("session"), async (id) => {
    return Storage.read<Info>(["session", id])
  })

  export async function* list() {
    for (const item of await Storage.list(["session"])) {
      const session = await Storage.read<Info>(item).catch(() => undefined)
      if (!session) continue
      yield session
    }
  }

  export async function update(id: string, editor: (session: Info) => void, options?: { touch?: boolean }) {
    const result = await Storage.update<Info>(["session", id], (draft) => {
      editor(draft)
      if (options?.touch !== false) {
        draft.time.updated = Date.now()
      }
    })
    Bus.publish(Event.Updated, { info: result })
    return result
  }

  export const remove = fn(Identifier.schema("session"), async (sessionID) => {
    try {
      const session = await get(sessionID)
      // Cascade: delete all parts, then messages, then session
      for (const msg of await Storage.list(["message", sessionID])) {
        for (const part of await Storage.list(["part", msg.at(-1)!])) {
          await Storage.remove(part)
        }
        await Storage.remove(msg)
      }
      await Storage.remove(["session", sessionID])
      Bus.publish(Event.Deleted, { info: session })
    } catch (e) {
      log.error("remove failed", { sessionID, error: e instanceof Error ? e : undefined })
    }
  })

  // ---------------------------------------------------------------------------
  // Message write operations
  // ---------------------------------------------------------------------------

  export const updateMessage = fn(MessageV2.Info, async (msg) => {
    await Storage.write(["message", msg.sessionID, msg.id], msg)
    Bus.publish(MessageV2.Event.Updated, { info: msg })
    return msg
  })

  export const removeMessage = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      messageID: Identifier.schema("message"),
    }),
    async (input) => {
      await Storage.remove(["message", input.sessionID, input.messageID])
      Bus.publish(MessageV2.Event.Removed, {
        sessionID: input.sessionID,
        messageID: input.messageID,
      })
      return input.messageID
    },
  )

  // ---------------------------------------------------------------------------
  // Part write operations
  // ---------------------------------------------------------------------------

  const UpdatePartInput = z.union([
    MessageV2.Part,
    z.object({
      part: MessageV2.TextPart,
      delta: z.string(),
    }),
    z.object({
      part: MessageV2.ReasoningPart,
      delta: z.string(),
    }),
    z.object({
      part: MessageV2.ToolPart,
      delta: z.string(),
    }),
  ])

  export const updatePart = fn(UpdatePartInput, async (input) => {
    const part = "delta" in input ? input.part : input
    const delta = "delta" in input ? input.delta : undefined
    await Storage.write(["part", part.messageID, part.id], part)
    Bus.publish(MessageV2.Event.PartUpdated, {
      part,
      delta,
    })
    return part
  })

  export const removePart = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      messageID: Identifier.schema("message"),
      partID: Identifier.schema("part"),
    }),
    async (input) => {
      await Storage.remove(["part", input.messageID, input.partID])
      Bus.publish(MessageV2.Event.PartRemoved, {
        sessionID: input.sessionID,
        messageID: input.messageID,
        partID: input.partID,
      })
      return input.partID
    },
  )

  // ---------------------------------------------------------------------------
  // 辅助函数
  // ---------------------------------------------------------------------------

  /** 更新会话的 updated 时间戳 */
  export async function touch(sessionID: string) {
    await update(sessionID, () => {}, { touch: true })
  }

  /** 根据模型价格和 token 用量计算费用 */
  export function getUsage(input: {
    model: Provider.Model
    usage?: { inputTokens?: number; outputTokens?: number; reasoningTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number }
    metadata?: Record<string, unknown>
  }) {
    const usage = input.usage ?? {}
    const inputTokens = usage.inputTokens ?? 0
    const outputTokens = usage.outputTokens ?? 0
    const reasoningTokens = usage.reasoningTokens ?? 0
    const cacheRead = usage.cacheReadTokens ?? 0
    const cacheWrite = usage.cacheWriteTokens ?? 0

    const cost =
      (inputTokens * input.model.cost.input +
        outputTokens * input.model.cost.output +
        reasoningTokens * input.model.cost.output +
        cacheRead * input.model.cost.cache.read +
        cacheWrite * input.model.cost.cache.write) /
      1_000_000

    return {
      cost,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        reasoning: reasoningTokens,
        cache: { read: cacheRead, write: cacheWrite },
      },
    }
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  export const messages = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      limit: z.number().optional(),
    }),
    async (input) => {
      const result = [] as MessageV2.WithParts[]
      for await (const msg of MessageV2.stream(input.sessionID)) {
        if (input.limit && result.length >= input.limit) break
        result.push(msg)
      }
      result.reverse()
      return result
    },
  )
}
