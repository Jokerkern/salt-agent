import { streamText, stepCountIs, type ToolSet, type LanguageModel, type CoreMessage } from "ai"
import type { AgentInfo } from "./agent.js"
import { getSystemPrompt } from "./agent.js"
import { createAllTools, filterTools } from "../tool/tools/index.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Events yielded by the agent loop for consumers (SSE, IM, etc.) */
export type AgentEvent =
  | { type: "text-start" }
  | { type: "text-delta"; delta: string }
  | { type: "text-end"; text: string }
  | { type: "reasoning-start" }
  | { type: "reasoning-delta"; delta: string }
  | { type: "reasoning-end"; text: string }
  | { type: "tool-call-start"; toolName: string; toolCallId: string }
  | { type: "tool-call-args"; toolName: string; toolCallId: string; args: unknown }
  | { type: "tool-result"; toolName: string; toolCallId: string; result: unknown }
  | { type: "tool-error"; toolName: string; toolCallId: string; error: string }
  | { type: "step-finish"; finishReason: string; tokens?: { input: number; output: number } }
  | { type: "error"; error: string }
  | { type: "done"; finishReason: string }

export interface AgentLoopInput {
  model: LanguageModel
  agent: AgentInfo
  messages: CoreMessage[]
  cwd: string
  abort?: AbortSignal
}

// ---------------------------------------------------------------------------
// Doom loop detection
// ---------------------------------------------------------------------------

const DOOM_LOOP_THRESHOLD = 3

interface ToolCallRecord {
  name: string
  input: string
}

function isDoomLoop(history: ToolCallRecord[]): boolean {
  if (history.length < DOOM_LOOP_THRESHOLD) return false
  const last = history.slice(-DOOM_LOOP_THRESHOLD)
  const first = last[0]!
  return last.every((r) => r.name === first.name && r.input === first.input)
}

// ---------------------------------------------------------------------------
// Agent loop
// ---------------------------------------------------------------------------

/**
 * Run the agent loop.
 * Uses Vercel AI SDK's streamText with maxSteps for automatic tool-call cycling.
 * Yields events for each stream event so consumers can build SSE / callbacks.
 */
export async function* runAgentLoop(input: AgentLoopInput): AsyncGenerator<AgentEvent> {
  const tools = filterTools(createAllTools(input.cwd), input.agent.permission)
  const systemPrompt = getSystemPrompt(input.agent)
  const toolCallHistory: ToolCallRecord[] = []
  let lastFinishReason = "stop"

  // Track text and reasoning across events
  let currentText = ""
  let currentReasoning = ""

  const stream = streamText({
    model: input.model,
    system: systemPrompt,
    messages: input.messages,
    tools: tools as ToolSet,
    stopWhen: stepCountIs(input.agent.maxSteps ?? 25),
    abortSignal: input.abort,
    temperature: input.agent.temperature,
    topP: input.agent.topP,
    onError: (error) => {
      console.error("[agent-loop] stream error:", error)
    },
  })

  try {
    for await (const event of stream.fullStream) {
      if (input.abort?.aborted) break

      switch (event.type) {
        case "text-start":
          currentText = ""
          yield { type: "text-start" }
          break

        case "text-delta":
          currentText += event.text
          yield { type: "text-delta", delta: event.text }
          break

        case "text-end":
          yield { type: "text-end", text: currentText }
          currentText = ""
          break

        case "reasoning-start":
          currentReasoning = ""
          yield { type: "reasoning-start" }
          break

        case "reasoning-delta":
          currentReasoning += event.text
          yield { type: "reasoning-delta", delta: event.text }
          break

        case "reasoning-end":
          yield { type: "reasoning-end", text: currentReasoning }
          currentReasoning = ""
          break

        case "tool-call": {
          const record: ToolCallRecord = {
            name: event.toolName,
            input: JSON.stringify(event.input),
          }
          toolCallHistory.push(record)

          yield {
            type: "tool-call-start",
            toolName: event.toolName,
            toolCallId: event.toolCallId,
          }
          yield {
            type: "tool-call-args",
            toolName: event.toolName,
            toolCallId: event.toolCallId,
            args: event.input,
          }

          // Doom loop check
          if (isDoomLoop(toolCallHistory)) {
            yield {
              type: "error",
              error: `Doom loop detected: ${event.toolName} called ${DOOM_LOOP_THRESHOLD} times with identical arguments. Stopping.`,
            }
            yield { type: "done", finishReason: "doom-loop" }
            return
          }
          break
        }

        case "tool-result":
          yield {
            type: "tool-result",
            toolName: event.toolName,
            toolCallId: event.toolCallId,
            result: event.output,
          }
          break

        case "tool-error":
          yield {
            type: "tool-error",
            toolName: event.toolName,
            toolCallId: event.toolCallId,
            error: String(event.error),
          }
          break

        case "finish-step":
          lastFinishReason = event.finishReason
          yield {
            type: "step-finish",
            finishReason: event.finishReason,
            tokens: event.usage
              ? { input: event.usage.inputTokens ?? 0, output: event.usage.outputTokens ?? 0 }
              : undefined,
          }
          break

        case "error":
          yield { type: "error", error: String(event.error) }
          break

        default:
          // Ignore other events (start, finish, etc.)
          break
      }
    }

    yield { type: "done", finishReason: lastFinishReason }
  } catch (err: unknown) {
    if (input.abort?.aborted) {
      yield { type: "done", finishReason: "aborted" }
    } else {
      yield { type: "error", error: (err as Error).message ?? String(err) }
      yield { type: "done", finishReason: "error" }
    }
  }
}
