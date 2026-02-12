import z from "zod"
import { Tool } from "./tool.js"
import { Session } from "../session/session.js"
import { Identifier } from "../id/id.js"

const DISALLOWED = new Set(["batch"])

const DESCRIPTION = `并行执行多个工具调用以提升性能。

用法：
- 提供要同时执行的工具调用数组
- 每批最多 25 个工具调用
- 不允许递归批量调用
- 外部工具（MCP、环境）不可批量`

export const BatchTool = Tool.define("batch", async () => {
  return {
    description: DESCRIPTION,
    parameters: z.object({
      tool_calls: z
        .array(
          z.object({
            tool: z.string().describe("要执行的工具名称"),
            parameters: z
              .object({})
              .passthrough()
              .describe("工具参数"),
          }),
        )
        .min(1, "至少提供一个工具调用")
        .describe("要并行执行的工具调用数组"),
    }),
    formatValidationError(error: z.ZodError) {
      const formattedErrors = error.issues
        .map((issue) => {
          const path = issue.path.length > 0 ? issue.path.join(".") : "root"
          return `  - ${path}: ${issue.message}`
        })
        .join("\n")
      return `工具 'batch' 的参数无效：\n${formattedErrors}\n\n期望的载荷格式：\n  [{"tool": "工具名", "parameters": {...}}, {...}]`
    },
    async execute(params, ctx) {
      const toolCalls = params.tool_calls.slice(0, 25)
      const discardedCalls = params.tool_calls.slice(25)

      // Lazy import to avoid circular dependency
      const { ToolRegistry } = await import("./registry.js")
      const availableTools = await ToolRegistry.tools({
        modelID: "",
        providerID: "",
      })
      const toolMap = new Map(availableTools.map((t) => [t.id, t]))

      const executeCall = async (
        call: (typeof toolCalls)[0],
      ) => {
        const callStartTime = Date.now()
        const partID = Identifier.ascending("part")

        try {
          if (DISALLOWED.has(call.tool)) {
            throw new Error(
              `工具 '${call.tool}' 不允许在批量中执行。禁止的工具：${Array.from(DISALLOWED).join(", ")}`,
            )
          }

          const tool = toolMap.get(call.tool)
          if (!tool) {
            const availableToolsList = Array.from(toolMap.keys()).filter(
              (name) => !DISALLOWED.has(name) && name !== "invalid",
            )
            throw new Error(
              `工具 '${call.tool}' 不在注册表中。可用工具：${availableToolsList.join(", ")}`,
            )
          }
          const validatedParams = tool.parameters.parse(call.parameters)

          await Session.updatePart({
            id: partID,
            messageID: ctx.messageID,
            sessionID: ctx.sessionID,
            type: "tool",
            tool: call.tool,
            callID: partID,
            state: {
              status: "running",
              input: call.parameters,
              time: { start: callStartTime },
            },
          })

          const result = await tool.execute(validatedParams, {
            ...ctx,
            callID: partID,
          })

          await Session.updatePart({
            id: partID,
            messageID: ctx.messageID,
            sessionID: ctx.sessionID,
            type: "tool",
            tool: call.tool,
            callID: partID,
            state: {
              status: "completed",
              input: call.parameters,
              output: result.output,
              title: result.title,
              metadata: result.metadata,
              attachments: result.attachments,
              time: { start: callStartTime, end: Date.now() },
            },
          })

          return { success: true as const, tool: call.tool, result }
        } catch (error) {
          await Session.updatePart({
            id: partID,
            messageID: ctx.messageID,
            sessionID: ctx.sessionID,
            type: "tool",
            tool: call.tool,
            callID: partID,
            state: {
              status: "error",
              input: call.parameters,
              error:
                error instanceof Error ? error.message : String(error),
              time: { start: callStartTime, end: Date.now() },
            },
          })

          return { success: false as const, tool: call.tool, error }
        }
      }

      const results = await Promise.all(
        toolCalls.map((call) => executeCall(call)),
      )

      // Add discarded calls as errors
      const now = Date.now()
      for (const call of discardedCalls) {
        const partID = Identifier.ascending("part")
        await Session.updatePart({
          id: partID,
          messageID: ctx.messageID,
          sessionID: ctx.sessionID,
          type: "tool",
          tool: call.tool,
          callID: partID,
          state: {
            status: "error",
            input: call.parameters,
            error: "每批最多允许 25 个工具",
            time: { start: now, end: now },
          },
        })
        results.push({
          success: false as const,
          tool: call.tool,
          error: new Error("每批最多允许 25 个工具"),
        })
      }

      const successfulCalls = results.filter((r) => r.success).length
      const failedCalls = results.length - successfulCalls

      const outputMessage =
        failedCalls > 0
          ? `成功执行 ${successfulCalls}/${results.length} 个工具，${failedCalls} 个失败。`
          : `全部 ${successfulCalls} 个工具执行成功。\n\n下次回复中继续使用 batch 工具以获得最佳性能！`

      return {
        title: `批量执行（${successfulCalls}/${results.length} 成功）`,
        output: outputMessage,
        attachments: results
          .filter((result) => result.success)
          .flatMap((r) => (r as any).result.attachments ?? []),
        metadata: {
          totalCalls: results.length,
          successful: successfulCalls,
          failed: failedCalls,
          tools: params.tool_calls.map((c) => c.tool),
          details: results.map((r) => ({
            tool: r.tool,
            success: r.success,
          })),
        },
      }
    },
  }
})
