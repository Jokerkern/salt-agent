import { MessageV2 } from "./message.js"
import { Log } from "../util/log.js"
import { Identifier } from "../id/id.js"
import { Session } from "./session.js"
import { SessionStatus } from "./status.js"
import { Bus } from "../bus/bus.js"
import { Permission } from "../permission/permission.js"
import { LLM } from "./llm.js"
import type { Provider } from "../provider/provider.js"
import { Question } from "../tool/question.js"

/**
 * 会话处理器 — 处理 LLM 流式事件，管理工具执行生命周期。
 * 移植自 opencode 的 SessionProcessor。
 */
export namespace SessionProcessor {
  /** 死循环检测阈值：连续 N 次相同工具调用触发询问 */
  const DOOM_LOOP_THRESHOLD = 3
  const log = Log.create({ service: "session.processor" })

  export type Info = ReturnType<typeof create>
  export type Result = Awaited<ReturnType<Info["process"]>>

  // ---------------------------------------------------------------------------
  // 重试辅助函数
  // ---------------------------------------------------------------------------

  /** 可重试的 HTTP 状态码 */
  const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504, 529])

  /** 判断错误是否可重试，返回重试原因或 undefined */
  function isRetryable(error: unknown): string | undefined {
    if (error && typeof error === "object" && "name" in error) {
      if ((error as any).name === "APIError") {
        const e = error as { isRetryable?: boolean; statusCode?: number; message?: string }
        if (e.isRetryable || RETRYABLE_STATUS_CODES.has(e.statusCode ?? 0)) {
          return e.message ?? "可重试的 API 错误"
        }
      }
    }
    return undefined
  }

  /** 计算指数退避延迟（毫秒），含抖动 */
  function retryDelay(attempt: number): number {
    const base = Math.min(1000 * Math.pow(2, attempt - 1), 30000)
    const jitter = Math.random() * 1000
    return base + jitter
  }

  /** 可中断的延迟等待 */
  async function retrySleep(ms: number, abort: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms)
      const handler = () => {
        clearTimeout(timer)
        reject(new DOMException("已中断", "AbortError"))
      }
      abort.addEventListener("abort", handler, { once: true })
    })
  }

  /**
   * 创建会话处理器实例。
   * 消费 LLM.stream() 的 fullStream，将流式事件映射为消息 Part 更新。
   */
  export function create(input: {
    assistantMessage: MessageV2.Assistant
    sessionID: string
    model: Provider.Model
    abort: AbortSignal
  }) {
    const toolcalls: Record<string, MessageV2.ToolPart> = {}
    let blocked = false
    let attempt = 0

    const result = {
      get message() {
        return input.assistantMessage
      },
      partFromToolCall(toolCallID: string) {
        return toolcalls[toolCallID]
      },
      /**
       * 处理 LLM 流式输出。
       * 返回 "continue"（继续循环）| "stop"（终止）| "compact"（需要压缩）。
       */
      async process(streamInput: LLM.StreamInput): Promise<"continue" | "stop" | "compact"> {
        log.info("开始处理")

        while (true) {
          try {
            let currentText: MessageV2.TextPart | undefined
            const reasoningMap: Record<string, MessageV2.ReasoningPart> = {}
            const stream = await LLM.stream(streamInput)

            for await (const value of stream.fullStream) {
              input.abort.throwIfAborted()

              switch (value.type) {
                case "reasoning-start":
                  if (value.id in reasoningMap) continue
                  reasoningMap[value.id] = {
                    id: Identifier.ascending("part"),
                    messageID: input.assistantMessage.id,
                    sessionID: input.assistantMessage.sessionID,
                    type: "reasoning",
                    text: "",
                    time: { start: Date.now() },
                    metadata: value.providerMetadata as Record<string, any>,
                  }
                  break

                case "reasoning-delta":
                  if (value.id in reasoningMap) {
                    const part = reasoningMap[value.id]!
                    part.text += value.text
                    if (value.providerMetadata) part.metadata = value.providerMetadata as Record<string, any>
                    if (part.text) await Session.updatePart({ part, delta: value.text })
                  }
                  break

                case "reasoning-end":
                  if (value.id in reasoningMap) {
                    const part = reasoningMap[value.id]!
                    part.text = part.text.trimEnd()
                    part.time = { ...part.time, end: Date.now() }
                    if (value.providerMetadata) part.metadata = value.providerMetadata as Record<string, any>
                    await Session.updatePart(part)
                    delete reasoningMap[value.id]
                  }
                  break

                case "tool-input-start": {
                  const part = await Session.updatePart({
                    id: toolcalls[value.id]?.id ?? Identifier.ascending("part"),
                    messageID: input.assistantMessage.id,
                    sessionID: input.assistantMessage.sessionID,
                    type: "tool",
                    tool: value.toolName,
                    callID: value.id,
                    state: { status: "pending", input: {}, raw: "" },
                  })
                  toolcalls[value.id] = part as MessageV2.ToolPart
                  break
                }

                case "tool-input-delta":
                case "tool-input-end":
                  break

                case "tool-call": {
                  const match = toolcalls[value.toolCallId]
                  if (match) {
                    const part = await Session.updatePart({
                      ...match,
                      tool: value.toolName,
                      state: {
                        status: "running",
                        input: value.input,
                        time: { start: Date.now() },
                      },
                      metadata: value.providerMetadata as Record<string, any>,
                    })
                    toolcalls[value.toolCallId] = part as MessageV2.ToolPart

                    // 死循环检测：连续 N 次相同工具 + 相同参数
                    const parts = await MessageV2.parts(input.assistantMessage.id)
                    const lastN = parts.slice(-DOOM_LOOP_THRESHOLD)
                    if (
                      lastN.length === DOOM_LOOP_THRESHOLD &&
                      lastN.every(
                        (p) =>
                          p.type === "tool" &&
                          p.tool === value.toolName &&
                          p.state.status !== "pending" &&
                          JSON.stringify(p.state.input) === JSON.stringify(value.input),
                      )
                    ) {
                      const { Agent } = await import("../agent/agent.js")
                      const agent = await Agent.get(input.assistantMessage.agent)
                      await Permission.ask({
                        permission: "doom_loop",
                        patterns: [value.toolName],
                        sessionID: input.assistantMessage.sessionID,
                        metadata: { tool: value.toolName, input: value.input },
                        always: [value.toolName],
                        ruleset: agent.permission,
                      })
                    }
                  }
                  break
                }

                case "tool-result": {
                  const match = toolcalls[value.toolCallId]
                  if (match && match.state.status === "running") {
                    const output = value.output as {
                      output: string
                      title: string
                      metadata: Record<string, any>
                      attachments?: MessageV2.FilePart[]
                    }
                    await Session.updatePart({
                      ...match,
                      state: {
                        status: "completed",
                        input: value.input ?? match.state.input,
                        output: output.output,
                        metadata: output.metadata,
                        title: output.title,
                        time: { start: match.state.time.start, end: Date.now() },
                        attachments: output.attachments,
                      },
                    })
                    delete toolcalls[value.toolCallId]
                  }
                  break
                }

                case "tool-error": {
                  const match = toolcalls[value.toolCallId]
                  if (match && match.state.status === "running") {
                    await Session.updatePart({
                      ...match,
                      state: {
                        status: "error",
                        input: value.input ?? match.state.input,
                        error: (value.error as Error).toString(),
                        time: { start: match.state.time.start, end: Date.now() },
                      },
                    })
                    if (
                      value.error instanceof Permission.RejectedError ||
                      value.error instanceof Question.RejectedError
                    ) {
                      blocked = true
                    }
                    delete toolcalls[value.toolCallId]
                  }
                  break
                }

                case "error":
                  throw value.error

                case "finish-step": {
                  const usage = Session.getUsage({
                    model: input.model,
                    usage: value.usage,
                    metadata: value.providerMetadata as Record<string, unknown>,
                  })
                  input.assistantMessage.finish = value.finishReason
                  input.assistantMessage.cost += usage.cost
                  input.assistantMessage.tokens = usage.tokens
                  await Session.updateMessage(input.assistantMessage)
                  break
                }

                case "text-start":
                  currentText = {
                    id: Identifier.ascending("part"),
                    messageID: input.assistantMessage.id,
                    sessionID: input.assistantMessage.sessionID,
                    type: "text",
                    text: "",
                    time: { start: Date.now() },
                    metadata: value.providerMetadata as Record<string, any>,
                  }
                  break

                case "text-delta":
                  if (currentText) {
                    currentText.text += value.text
                    if (value.providerMetadata) currentText.metadata = value.providerMetadata as Record<string, any>
                    if (currentText.text) {
                      await Session.updatePart({ part: currentText, delta: value.text })
                    }
                  }
                  break

                case "text-end":
                  if (currentText) {
                    currentText.text = currentText.text.trimEnd()
                    currentText.time = { start: currentText.time!.start, end: Date.now() }
                    if (value.providerMetadata) currentText.metadata = value.providerMetadata as Record<string, any>
                    await Session.updatePart(currentText)
                  }
                  currentText = undefined
                  break

                case "finish":
                  break

                default:
                  continue
              }
            }
          } catch (e: any) {
            log.error("处理异常", { error: e, stack: JSON.stringify(e?.stack) })
            const error = MessageV2.fromError(e, { providerID: input.model.providerID })

            const retry = isRetryable(error)
            if (retry !== undefined) {
              attempt++
              const delay = retryDelay(attempt)
              log.info("重试中", { attempt, delay, reason: retry })
              SessionStatus.set(input.sessionID, {
                type: "retry",
                attempt,
                message: retry,
                next: Date.now() + delay,
              })
              await retrySleep(delay, input.abort).catch(() => {})
              continue
            }
            input.assistantMessage.error = error
            Bus.publish(Session.Event.Error, {
              sessionID: input.assistantMessage.sessionID,
              error: input.assistantMessage.error,
            })
            SessionStatus.set(input.sessionID, { type: "idle" })
          }

          // 将未完成的工具 Part 标记为错误
          const p = await MessageV2.parts(input.assistantMessage.id)
          for (const part of p) {
            if (
              part.type === "tool" &&
              part.state.status !== "completed" &&
              part.state.status !== "error"
            ) {
              await Session.updatePart({
                ...part,
                state: {
                  ...part.state,
                  status: "error",
                  error: "工具执行被中断",
                  time: { start: Date.now(), end: Date.now() },
                } as MessageV2.ToolStateError,
              })
            }
          }
          if (!input.assistantMessage.finish) {
            input.assistantMessage.finish = input.assistantMessage.error ? "error" : "stop"
          }
          input.assistantMessage.time.completed = Date.now()
          await Session.updateMessage(input.assistantMessage)

          if (blocked) return "stop"
          if (input.assistantMessage.error) return "stop"
          return "continue"
        }
      },
    }
    return result
  }
}
