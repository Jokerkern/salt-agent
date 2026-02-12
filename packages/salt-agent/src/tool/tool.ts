import z from "zod"
import type { MessageV2 } from "../session/message.js"
import type { Permission } from "../permission/permission.js"
import { Truncate } from "./truncation.js"

/**
 * Core tool definition framework.
 * Ported from opencode — adapted for Node.js.
 */
export namespace Tool {
  export interface Metadata {
    [key: string]: any
  }

  export interface InitContext {
    agent?: { name: string; permission?: Permission.Ruleset }
  }

  export type Context<M extends Metadata = Metadata> = {
    sessionID: string
    messageID: string
    agent: string
    abort: AbortSignal
    callID?: string
    extra?: { [key: string]: any }
    messages: MessageV2.WithParts[]
    metadata(input: { title?: string; metadata?: M }): void
    ask(
      input: Omit<Permission.Request, "id" | "sessionID" | "tool">,
    ): Promise<void>
  }

  export interface Info<
    Parameters extends z.ZodType = z.ZodType,
    M extends Metadata = Metadata,
  > {
    id: string
    init: (ctx?: InitContext) => Promise<{
      description: string
      parameters: Parameters
      execute(
        args: z.infer<Parameters>,
        ctx: Context,
      ): Promise<{
        title: string
        metadata: M
        output: string
        attachments?: MessageV2.FilePart[]
      }>
      formatValidationError?(error: z.ZodError): string
    }>
  }

  export type InferParameters<T extends Info> = T extends Info<infer P>
    ? z.infer<P>
    : never
  export type InferMetadata<T extends Info> = T extends Info<any, infer M>
    ? M
    : never

  export function define<
    Parameters extends z.ZodType,
    Result extends Metadata,
  >(
    id: string,
    init:
      | Info<Parameters, Result>["init"]
      | Awaited<ReturnType<Info<Parameters, Result>["init"]>>,
  ): Info<Parameters, Result> {
    return {
      id,
      init: async (initCtx) => {
        const toolInfo =
          init instanceof Function ? await init(initCtx) : init
        const execute = toolInfo.execute
        toolInfo.execute = async (args, ctx) => {
          try {
            toolInfo.parameters.parse(args)
          } catch (error) {
            if (error instanceof z.ZodError && toolInfo.formatValidationError) {
              throw new Error(toolInfo.formatValidationError(error), {
                cause: error,
              })
            }
            throw new Error(
              `工具 ${id} 被传入了无效参数：${error}。\n请按预期模式重新编写输入。`,
              { cause: error },
            )
          }
          const result = await execute(args, ctx)
          // skip truncation for tools that handle it themselves
          if (result.metadata.truncated !== undefined) {
            return result
          }
          const truncated = await Truncate.output(result.output)
          return {
            ...result,
            output: truncated.content,
            metadata: {
              ...result.metadata,
              truncated: truncated.truncated,
              ...(truncated.truncated && {
                outputPath: truncated.outputPath,
              }),
            },
          }
        }
        return toolInfo
      },
    }
  }
}
