import z from "zod"
import { convertToModelMessages, type ModelMessage, type UIMessage, APICallError } from "ai"
import { BusEvent } from "../bus/bus-event.js"
import { Identifier } from "../id/id.js"
import { NamedError } from "../util/error.js"
import { ProviderError } from "../provider/error.js"
import { fn } from "../util/fn.js"
import { Storage } from "../storage/storage.js"
import type { Provider } from "../provider/provider.js"

export namespace MessageV2 {
  // ---------------------------------------------------------------------------
  // Errors
  // ---------------------------------------------------------------------------

  export const OutputLengthError = NamedError.create("MessageOutputLengthError", z.object({}))
  export const AbortedError = NamedError.create("MessageAbortedError", z.object({ message: z.string() }))
  export const AuthError = NamedError.create(
    "ProviderAuthError",
    z.object({
      providerID: z.string(),
      message: z.string(),
    }),
  )
  export const APIError = NamedError.create(
    "APIError",
    z.object({
      message: z.string(),
      statusCode: z.number().optional(),
      isRetryable: z.boolean(),
      responseHeaders: z.record(z.string(), z.string()).optional(),
      responseBody: z.string().optional(),
      metadata: z.record(z.string(), z.string()).optional(),
    }),
  )
  export type APIError = z.infer<typeof APIError.Schema>
  export const ContextOverflowError = NamedError.create(
    "ContextOverflowError",
    z.object({ message: z.string(), responseBody: z.string().optional() }),
  )
  export const StructuredOutputError = NamedError.create(
    "StructuredOutputError",
    z.object({
      message: z.string(),
      retries: z.number(),
    }),
  )

  // ---------------------------------------------------------------------------
  // Part types
  // ---------------------------------------------------------------------------

  const PartBase = z.object({
    id: z.string(),
    sessionID: z.string(),
    messageID: z.string(),
  })

  export const TextPart = PartBase.extend({
    type: z.literal("text"),
    text: z.string(),
    synthetic: z.boolean().optional(),
    ignored: z.boolean().optional(),
    time: z
      .object({
        start: z.number(),
        end: z.number().optional(),
      })
      .optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  })
  export type TextPart = z.infer<typeof TextPart>

  export const ReasoningPart = PartBase.extend({
    type: z.literal("reasoning"),
    text: z.string(),
    metadata: z.record(z.string(), z.any()).optional(),
    time: z.object({
      start: z.number(),
      end: z.number().optional(),
    }),
  })
  export type ReasoningPart = z.infer<typeof ReasoningPart>

  export const FilePart = PartBase.extend({
    type: z.literal("file"),
    mime: z.string(),
    url: z.string(),
  })
  export type FilePart = z.infer<typeof FilePart>

  // Tool state machine: pending -> running -> completed | error

  export const ToolStatePending = z.object({
    status: z.literal("pending"),
    input: z.record(z.string(), z.any()),
    raw: z.string(),
  })
  export type ToolStatePending = z.infer<typeof ToolStatePending>

  export const ToolStateRunning = z.object({
    status: z.literal("running"),
    input: z.record(z.string(), z.any()),
    title: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
    time: z.object({
      start: z.number(),
    }),
  })
  export type ToolStateRunning = z.infer<typeof ToolStateRunning>

  export const ToolStateCompleted = z.object({
    status: z.literal("completed"),
    input: z.record(z.string(), z.any()),
    output: z.string(),
    title: z.string(),
    metadata: z.record(z.string(), z.any()),
    attachments: z.array(FilePart).optional(),
    time: z.object({
      start: z.number(),
      end: z.number(),
      compacted: z.number().optional(),
    }),
  })
  export type ToolStateCompleted = z.infer<typeof ToolStateCompleted>

  export const ToolStateError = z.object({
    status: z.literal("error"),
    input: z.record(z.string(), z.any()),
    error: z.string(),
    metadata: z.record(z.string(), z.any()).optional(),
    time: z.object({
      start: z.number(),
      end: z.number(),
    }),
  })
  export type ToolStateError = z.infer<typeof ToolStateError>

  export const ToolState = z.discriminatedUnion("status", [
    ToolStatePending,
    ToolStateRunning,
    ToolStateCompleted,
    ToolStateError,
  ])

  export const ToolPart = PartBase.extend({
    type: z.literal("tool"),
    callID: z.string(),
    tool: z.string(),
    state: ToolState,
    metadata: z.record(z.string(), z.any()).optional(),
  })
  export type ToolPart = z.infer<typeof ToolPart>

  export const Part = z.discriminatedUnion("type", [TextPart, ReasoningPart, ToolPart, FilePart])
  export type Part = z.infer<typeof Part>

  // ---------------------------------------------------------------------------
  // Message types
  // ---------------------------------------------------------------------------

  const Base = z.object({
    id: z.string(),
    sessionID: z.string(),
  })

  export const User = Base.extend({
    role: z.literal("user"),
    time: z.object({
      created: z.number(),
    }),
    agent: z.string(),
    model: z.object({
      providerID: z.string(),
      modelID: z.string(),
    }),
    system: z.string().optional(),
    tools: z.record(z.string(), z.boolean()).optional(),
    variant: z.string().optional(),
  })
  export type User = z.infer<typeof User>

  export const Assistant = Base.extend({
    role: z.literal("assistant"),
    time: z.object({
      created: z.number(),
      completed: z.number().optional(),
    }),
    error: z
      .discriminatedUnion("name", [
        AuthError.Schema,
        NamedError.Unknown.Schema,
        OutputLengthError.Schema,
        AbortedError.Schema,
        StructuredOutputError.Schema,
        ContextOverflowError.Schema,
        APIError.Schema,
      ])
      .optional(),
    parentID: z.string(),
    modelID: z.string(),
    providerID: z.string(),
    mode: z.string(),
    agent: z.string(),
    path: z.object({
      cwd: z.string(),
      root: z.string(),
    }),
    summary: z.boolean().optional(),
    cost: z.number(),
    tokens: z.object({
      total: z.number().optional(),
      input: z.number(),
      output: z.number(),
      reasoning: z.number(),
      cache: z.object({
        read: z.number(),
        write: z.number(),
      }),
    }),
    structured: z.any().optional(),
    variant: z.string().optional(),
    finish: z.string().optional(),
  })
  export type Assistant = z.infer<typeof Assistant>

  export const Info = z.discriminatedUnion("role", [User, Assistant])
  export type Info = z.infer<typeof Info>

  // ---------------------------------------------------------------------------
  // WithParts
  // ---------------------------------------------------------------------------

  export const WithParts = z.object({
    info: Info,
    parts: z.array(Part),
  })
  export type WithParts = z.infer<typeof WithParts>

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  export const Event = {
    Updated: BusEvent.define(
      "message.updated",
      z.object({
        info: Info,
      }),
    ),
    Removed: BusEvent.define(
      "message.removed",
      z.object({
        sessionID: z.string(),
        messageID: z.string(),
      }),
    ),
    PartUpdated: BusEvent.define(
      "message.part.updated",
      z.object({
        part: Part,
        delta: z.string().optional(),
      }),
    ),
    PartRemoved: BusEvent.define(
      "message.part.removed",
      z.object({
        sessionID: z.string(),
        messageID: z.string(),
        partID: z.string(),
      }),
    ),
  }

  // ---------------------------------------------------------------------------
  // Read operations
  // ---------------------------------------------------------------------------

  export const parts = fn(Identifier.schema("message"), async (messageID) => {
    const result = [] as MessageV2.Part[]
    for (const item of await Storage.list(["part", messageID])) {
      const read = await Storage.read<MessageV2.Part>(item)
      result.push(read)
    }
    result.sort((a, b) => (a.id > b.id ? 1 : -1))
    return result
  })

  export const get = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      messageID: Identifier.schema("message"),
    }),
    async (input): Promise<WithParts> => {
      return {
        info: await Storage.read<MessageV2.Info>(["message", input.sessionID, input.messageID]),
        parts: await parts(input.messageID),
      }
    },
  )

  export const stream = fn(Identifier.schema("session"), async function* (sessionID) {
    const list = await Storage.list(["message", sessionID])
    for (let i = list.length - 1; i >= 0; i--) {
      yield await get({
        sessionID,
        messageID: list[i]![2]!,
      })
    }
  })

  // ---------------------------------------------------------------------------
  // 模型消息转换
  // ---------------------------------------------------------------------------

  /**
   * 将内部消息转换为 AI SDK ModelMessage 格式。
   * 处理用户文本、文件、助手文本、工具调用/结果和推理。
   */
  export async function toModelMessages(input: WithParts[], model: Provider.Model): Promise<ModelMessage[]> {
    const result: UIMessage[] = []
    const toolNames = new Set<string>()

    const toModelOutput = (output: unknown) => {
      if (typeof output === "string") {
        return { type: "text", value: output }
      }
      return { type: "json", value: output as never }
    }

    for (const msg of input) {
      if (msg.parts.length === 0) continue

      if (msg.info.role === "user") {
        const userMessage: UIMessage = {
          id: msg.info.id,
          role: "user",
          parts: [],
        }
        result.push(userMessage)
        for (const part of msg.parts) {
          if (part.type === "text" && !part.ignored) {
            userMessage.parts.push({ type: "text", text: part.text })
          }
          if (part.type === "file" && part.mime !== "text/plain" && part.mime !== "application/x-directory") {
            userMessage.parts.push({
              type: "file",
              url: part.url,
              mediaType: part.mime,
            })
          }
        }
      }

      if (msg.info.role === "assistant") {
        if (
          msg.info.error &&
          !(
            MessageV2.AbortedError.isInstance(msg.info.error) &&
            msg.parts.some((part) => part.type !== "reasoning")
          )
        ) {
          continue
        }

        const differentModel =
          `${model.providerID}/${model.id}` !== `${msg.info.providerID}/${msg.info.modelID}`

        const assistantMessage: UIMessage = {
          id: msg.info.id,
          role: "assistant",
          parts: [],
        }

        for (const part of msg.parts) {
          if (part.type === "text") {
            assistantMessage.parts.push({
              type: "text",
              text: part.text,
              ...(differentModel ? {} : { providerMetadata: part.metadata }),
            })
          }
          if (part.type === "tool") {
            toolNames.add(part.tool)
            if (part.state.status === "completed") {
              assistantMessage.parts.push({
                type: ("tool-" + part.tool) as `tool-${string}`,
                state: "output-available",
                toolCallId: part.callID,
                input: part.state.input,
                output: part.state.output,
                ...(differentModel ? {} : { callProviderMetadata: part.metadata }),
              })
            }
            if (part.state.status === "error") {
              assistantMessage.parts.push({
                type: ("tool-" + part.tool) as `tool-${string}`,
                state: "output-error",
                toolCallId: part.callID,
                input: part.state.input,
                errorText: part.state.error,
                ...(differentModel ? {} : { callProviderMetadata: part.metadata }),
              })
            }
            if (part.state.status === "pending" || part.state.status === "running") {
              assistantMessage.parts.push({
                type: ("tool-" + part.tool) as `tool-${string}`,
                state: "output-error",
                toolCallId: part.callID,
                input: part.state.input,
                errorText: "[Tool execution was interrupted]",
                ...(differentModel ? {} : { callProviderMetadata: part.metadata }),
              })
            }
          }
          if (part.type === "reasoning") {
            assistantMessage.parts.push({
              type: "reasoning",
              text: part.text,
              ...(differentModel ? {} : { providerMetadata: part.metadata }),
            })
          }
        }

        if (assistantMessage.parts.length > 0) {
          result.push(assistantMessage)
        }
      }
    }

    const tools = Object.fromEntries(
      Array.from(toolNames).map((toolName) => [toolName, { toModelOutput }]),
    )

    return await convertToModelMessages(
      result.filter((msg) => msg.parts.some((part) => part.type !== "step-start")),
      {
        // @ts-expect-error convertToModelMessages only needs tools[name]?.toModelOutput
        tools,
      },
    )
  }

  // ---------------------------------------------------------------------------
  // 错误转换
  // ---------------------------------------------------------------------------

  /** 将各类异常转换为标准化错误对象 */
  export function fromError(e: unknown, ctx: { providerID: string }) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return new MessageV2.AbortedError({ message: e.message }, { cause: e }).toObject()
    }
    if (MessageV2.OutputLengthError.isInstance(e)) {
      return e
    }
    if (APICallError.isInstance(e)) {
      const parsed = ProviderError.parseAPICallError({ providerID: ctx.providerID, error: e })
      if (parsed.type === "context_overflow") {
        return new MessageV2.ContextOverflowError(
          { message: parsed.message, responseBody: parsed.responseBody },
          { cause: e },
        ).toObject()
      }
      return new MessageV2.APIError(
        {
          message: parsed.message,
          statusCode: parsed.statusCode,
          isRetryable: parsed.isRetryable ?? false,
          responseBody: parsed.responseBody,
        },
        { cause: e },
      ).toObject()
    }
    if (e instanceof Error) {
      return new NamedError.Unknown({ message: e.toString() }, { cause: e }).toObject()
    }
    return new NamedError.Unknown({ message: String(e) }).toObject()
  }
}
