import os from "os"
import { streamText, type ModelMessage, type ToolSet } from "ai"
import type { Tool } from "ai"
import { Provider } from "../provider/provider.js"
import { ProviderTransform } from "../provider/transform.js"
import { Permission } from "../permission/permission.js"
import { Workspace } from "../workspace/workspace.js"
import { Log } from "../util/log.js"
import type { Agent } from "../agent/agent.js"
import type { MessageV2 } from "./message.js"

/**
 * LLM 命名空间 — 封装 AI SDK 的 streamText，集成代理配置。
 * 简化自 opencode 的 LLM 命名空间（无 Plugin、无 Auth OAuth、无 Skill）。
 */
export namespace LLM {
  const log = Log.create({ service: "llm" })

  export type StreamInput = {
    user: MessageV2.User
    sessionID: string
    model: Provider.Model
    agent: Agent.Info
    system: string[]
    abort: AbortSignal
    messages: ModelMessage[]
    small?: boolean
    tools: Record<string, Tool>
    retries?: number
    toolChoice?: "auto" | "required" | "none"
  }

  /**
   * 构建环境系统提示词。
   * 描述平台、工作目录和日期等运行时信息。
   */
  export function environmentPrompt(): string {
    return [
      `你是一个 AI 编程助手。你可以使用工具来完成任务。`,
      ``,
      `## 环境信息`,
      `- 平台: ${os.platform()} ${os.arch()}`,
      `- Shell: ${process.env.SHELL || process.env.COMSPEC || "未知"}`,
      `- 工作目录: ${Workspace.directory}`,
      `- 日期: ${new Date().toISOString().split("T")[0]}`,
      ``,
      `## 使用指南`,
      `- 使用工具读取文件、搜索代码并进行修改`,
      `- 保持精确和高效`,
      `- 清晰地报告错误`,
      `- 当任务需要多个步骤时，分解后依次使用工具执行`,
    ].join("\n")
  }

  /** 返回被代理权限规则集拒绝的工具 ID 集合。 */
  function disabled(toolIds: string[], ruleset: Permission.Ruleset): Set<string> {
    return new Set(toolIds.filter((id) => Permission.evaluate(id, "*", ruleset).action === "deny"))
  }

  export async function stream(input: StreamInput): Promise<ReturnType<typeof streamText>> {
    const l = log
      .clone()
      .tag("providerID", input.model.providerID)
      .tag("modelID", input.model.id)
      .tag("sessionID", input.sessionID)
      .tag("agent", input.agent.name)
    l.info("stream")

    const language = await Provider.getLanguage(input.model)

    // 构建系统提示词
    const system: string[] = []
    if (input.agent.prompt) {
      system.push(input.agent.prompt)
    }
    system.push(...input.system)
    if (input.user.system) {
      system.push(input.user.system)
    }
    const combined = system.filter(Boolean).join("\n")

    // 解析模型参数
    const baseOpts = input.small
      ? ProviderTransform.smallOptions(input.model)
      : ProviderTransform.options(input.model)

    // openai-compatible providers 可能不支持 max_tokens（新模型用 max_completion_tokens）
    // 不传 maxOutputTokens，让 API 使用默认值
    const maxOutputTokens = input.model.api.npm === "@ai-sdk/openai-compatible"
      ? undefined
      : ProviderTransform.maxOutputTokens(input.model)

    // 过滤被禁用的工具
    const tools = { ...input.tools }
    if (input.user.tools) {
      for (const [toolId, enabled] of Object.entries(input.user.tools)) {
        if (!enabled) delete tools[toolId]
      }
    }
    const disabledSet = disabled(Object.keys(tools), input.agent.permission)
    for (const id of disabledSet) {
      delete tools[id]
    }

    return streamText({
      onError(error) {
        l.error("流式错误", { error })
      },
      async experimental_repairToolCall(failed) {
        const lower = failed.toolCall.toolName.toLowerCase()
        if (lower !== failed.toolCall.toolName && tools[lower]) {
          l.info("修复工具调用", { tool: failed.toolCall.toolName, repaired: lower })
          return { ...failed.toolCall, toolName: lower }
        }
        return {
          ...failed.toolCall,
          input: JSON.stringify({ tool: failed.toolCall.toolName, error: failed.error.message }),
          toolName: "invalid",
        }
      },
      temperature: input.model.capabilities.temperature
        ? (input.agent.temperature ?? baseOpts.temperature)
        : undefined,
      topP: input.agent.topP,
      providerOptions: ProviderTransform.providerOptions(input.model, input.model.options) as any,
      activeTools: Object.keys(tools).filter((x) => x !== "invalid"),
      tools: tools as ToolSet,
      toolChoice: input.toolChoice,
      maxOutputTokens,
      abortSignal: input.abort,
      maxRetries: input.retries ?? 0,
      messages: [
        ...(combined
          ? [{ role: "system" as const, content: combined }]
          : []),
        ...input.messages,
      ],
      model: language as any,
    })
  }
}
