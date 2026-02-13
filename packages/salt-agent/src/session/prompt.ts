import z from "zod"
import { tool, type Tool as AITool, type ToolCallOptions } from "ai"
import { Identifier } from "../id/id.js"
import { MessageV2 } from "./message.js"
import { Log } from "../util/log.js"
import { Session } from "./session.js"
import { Agent } from "../agent/agent.js"
import { Provider } from "../provider/provider.js"
import { ToolRegistry } from "../tool/registry.js"
import { Permission } from "../permission/permission.js"
import { Workspace } from "../workspace/workspace.js"
import { Bus } from "../bus/bus.js"
import { SessionProcessor } from "./processor.js"
import { SessionStatus } from "./status.js"
import { LLM } from "./llm.js"
import { Tool } from "../tool/tool.js"
import { fn } from "../util/fn.js"

/**
 * 会话提示词命名空间 — Agent 主循环。
 * 处理流程：创建用户消息 → LLM 调用 → 工具执行 → 结果回传。
 * 移植自 opencode 的 SessionPrompt。
 */
export namespace SessionPrompt {
  const log = Log.create({ service: "session.prompt" })

  // ---------------------------------------------------------------------------
  // 状态 — 跟踪活跃会话及其 AbortController
  // ---------------------------------------------------------------------------

  const state: Record<
    string,
    {
      abort: AbortController
      callbacks: {
        resolve(input: MessageV2.WithParts): void
        reject(reason?: any): void
      }[]
    }
  > = {}

  /** 断言会话未在忙碌状态 */
  export function assertNotBusy(sessionID: string) {
    if (state[sessionID]) throw new Session.BusyError(sessionID)
  }

  /** 启动新的会话循环，返回 AbortSignal */
  function start(sessionID: string) {
    if (state[sessionID]) return
    const controller = new AbortController()
    state[sessionID] = { abort: controller, callbacks: [] }
    return controller.signal
  }

  /** 恢复已有的会话循环 */
  function resume(sessionID: string) {
    if (!state[sessionID]) return
    return state[sessionID].abort.signal
  }

  /** 取消正在运行的会话循环 */
  export function cancel(sessionID: string) {
    log.info("取消", { sessionID })
    const match = state[sessionID]
    if (!match) {
      SessionStatus.set(sessionID, { type: "idle" })
      return
    }
    match.abort.abort()
    delete state[sessionID]
    SessionStatus.set(sessionID, { type: "idle" })
  }

  // ---------------------------------------------------------------------------
  // 输入 Schema
  // ---------------------------------------------------------------------------

  export const PromptInput = z.object({
    sessionID: Identifier.schema("session"),
    messageID: Identifier.schema("message").optional(),
    model: z
      .object({
        providerID: z.string(),
        modelID: z.string(),
      })
      .optional(),
    agent: z.string().optional(),
    noReply: z.boolean().optional(),
    tools: z.record(z.string(), z.boolean()).optional(),
    system: z.string().optional(),
    variant: z.string().optional(),
    parts: z.array(
      z.discriminatedUnion("type", [
        MessageV2.TextPart.omit({ messageID: true, sessionID: true }).partial({ id: true }),
        MessageV2.FilePart.omit({ messageID: true, sessionID: true }).partial({ id: true }),
      ]),
    ),
  })
  export type PromptInput = z.infer<typeof PromptInput>

  // ---------------------------------------------------------------------------
  // prompt() — 入口函数
  // ---------------------------------------------------------------------------

  export const prompt = fn(PromptInput, async (input) => {
    const message = await createUserMessage(input)
    await Session.touch(input.sessionID)

    // 向后兼容：允许通过 prompt 输入覆盖工具权限
    const session = await Session.get(input.sessionID)
    const permissions: Permission.Ruleset = []
    for (const [toolId, enabled] of Object.entries(input.tools ?? {})) {
      permissions.push({
        permission: toolId,
        action: enabled ? "allow" : "deny",
        pattern: "*",
      })
    }
    if (permissions.length > 0) {
      session.permission = permissions
      await Session.update(session.id, (draft) => {
        draft.permission = permissions
      })
    }

    if (input.noReply === true) {
      return message
    }

    return loop({ sessionID: input.sessionID })
  })

  // ---------------------------------------------------------------------------
  // loop() — 核心 Agent 循环
  // ---------------------------------------------------------------------------

  export const LoopInput = z.object({
    sessionID: Identifier.schema("session"),
    resume_existing: z.boolean().optional(),
  })

  export const loop = fn(LoopInput, async (input): Promise<MessageV2.WithParts> => {
    const { sessionID, resume_existing } = input

    const abort = resume_existing ? resume(sessionID) : start(sessionID)
    if (!abort) {
      // 已在运行 — 排队等待回调
      return new Promise<MessageV2.WithParts>((resolve, reject) => {
        const callbacks = state[sessionID]!.callbacks
        callbacks.push({ resolve, reject })
      })
    }

    try {
      let step = 0
      const session = await Session.get(sessionID)

      while (true) {
        SessionStatus.set(sessionID, { type: "busy" })
        log.info("循环", { step, sessionID })
        if (abort.aborted) break

        // 收集所有消息
        const msgs: MessageV2.WithParts[] = []
        for await (const msg of MessageV2.stream(sessionID)) {
          msgs.push(msg)
        }
        msgs.reverse()

        // 查找最新的用户消息和助手消息
        let lastUser: MessageV2.User | undefined
        let lastAssistant: MessageV2.Assistant | undefined
        let lastFinished: MessageV2.Assistant | undefined

        for (let i = msgs.length - 1; i >= 0; i--) {
          const msg = msgs[i]!
          if (!lastUser && msg.info.role === "user") lastUser = msg.info as MessageV2.User
          if (!lastAssistant && msg.info.role === "assistant") lastAssistant = msg.info as MessageV2.Assistant
          if (!lastFinished && msg.info.role === "assistant" && (msg.info as MessageV2.Assistant).finish) {
            lastFinished = msg.info as MessageV2.Assistant
          }
          if (lastUser && lastFinished) break
        }

        if (!lastUser) throw new Error("消息流中未找到用户消息。这不应该发生。")

        // 终止检查：助手已完成且用户消息更早
        if (
          lastAssistant?.finish &&
          !["tool-calls", "unknown"].includes(lastAssistant.finish) &&
          lastUser.id < lastAssistant.id
        ) {
          log.info("退出循环", { sessionID })
          break
        }

        step++

        // 获取模型
        const model = await Provider.getModel(lastUser.model.providerID, lastUser.model.modelID).catch((e) => {
          if (Provider.ModelNotFoundError.isInstance(e)) {
            Bus.publish(Session.Event.Error, {
              sessionID,
              error: { name: "Unknown", message: `找不到模型: ${e.data.providerID}/${e.data.modelID}` },
            })
          }
          throw e
        })

        // 获取代理
        const agent = await Agent.get(lastUser.agent)
        const maxSteps = agent.steps ?? Infinity
        const isLastStep = step >= maxSteps

        // 创建助手消息
        const processor = SessionProcessor.create({
          assistantMessage: await Session.updateMessage({
            id: Identifier.ascending("message"),
            parentID: lastUser.id,
            role: "assistant",
            mode: agent.name,
            agent: agent.name,
            variant: lastUser.variant,
            path: {
              cwd: Workspace.directory,
              root: Workspace.worktree,
            },
            cost: 0,
            tokens: {
              input: 0,
              output: 0,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
            modelID: model.id,
            providerID: model.providerID,
            time: { created: Date.now() },
            sessionID,
          }) as MessageV2.Assistant,
          sessionID,
          model,
          abort,
        })

        // 解析工具
        const tools = await resolveTools({
          agent,
          session,
          model,
          processor,
          messages: msgs,
        })

        // 构建系统提示词
        const system = [LLM.environmentPrompt()]

        // 执行处理
        const result = await processor.process({
          user: lastUser,
          agent,
          abort,
          sessionID,
          system,
          messages: [
            ...(await MessageV2.toModelMessages(msgs, model)),
            ...(isLastStep
              ? [
                  {
                    role: "assistant" as const,
                    content: "已达到最大步数限制。现在提供最终响应。",
                  },
                ]
              : []),
          ],
          tools,
          model,
        })

        if (result === "stop") break
        continue
      }

      // 返回最后一条助手消息
      for await (const item of MessageV2.stream(sessionID)) {
        if (item.info.role === "user") continue
        const queued = state[sessionID]?.callbacks ?? []
        for (const q of queued) {
          q.resolve(item)
        }
        return item
      }
      throw new Error("循环结束后未找到助手消息")
    } finally {
      cancel(sessionID)
    }
  })

  // ---------------------------------------------------------------------------
  // resolveTools() — 将注册工具包装为 AI SDK 格式
  // ---------------------------------------------------------------------------

  async function resolveTools(input: {
    agent: Agent.Info
    model: Provider.Model
    session: Session.Info
    processor: SessionProcessor.Info
    messages: MessageV2.WithParts[]
  }) {
    using _ = log.time("resolveTools")
    const tools: Record<string, AITool> = {}

    /** 为每次工具调用创建 Tool.Context */
    const context = (args: any, options: ToolCallOptions): Tool.Context => ({
      sessionID: input.session.id,
      abort: options.abortSignal!,
      messageID: input.processor.message.id,
      callID: options.toolCallId,
      agent: input.agent.name,
      messages: input.messages,
      metadata: async (val: { title?: string; metadata?: any }) => {
        const match = input.processor.partFromToolCall(options.toolCallId)
        if (match && match.state.status === "running") {
          await Session.updatePart({
            ...match,
            state: {
              title: val.title,
              metadata: val.metadata,
              status: "running",
              input: args,
              time: { start: Date.now() },
            },
          })
        }
      },
      async ask(req) {
        await Permission.ask({
          ...req,
          sessionID: input.session.id,
          tool: { messageID: input.processor.message.id, callID: options.toolCallId },
          ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),
        })
      },
    })

    for (const item of await ToolRegistry.tools(
      { modelID: input.model.id, providerID: input.model.providerID },
      { name: input.agent.name, permission: input.agent.permission },
    )) {
      // 使用 as any 绕过 ai SDK tool() 的严格重载解析
      // 工具返回 { title, metadata, output, attachments? }，ai SDK 运行时可正确处理
      // 注意：AI SDK v6 使用 inputSchema 替代了 parameters
      tools[item.id] = (tool as any)({
        description: item.description,
        inputSchema: item.parameters,
        execute: async (args: any, options: ToolCallOptions) => {
          const ctx = context(args, options)
          return await item.execute(args, ctx)
        },
      }) as AITool
    }

    return tools
  }

  // ---------------------------------------------------------------------------
  // createUserMessage() — 构建并持久化用户消息
  // ---------------------------------------------------------------------------

  async function createUserMessage(input: PromptInput) {
    const agent = await Agent.get(input.agent ?? (await Agent.defaultAgent()))
    const model = input.model ?? agent.model ?? (await Provider.defaultModel())

    const info: MessageV2.User = {
      id: input.messageID ?? Identifier.ascending("message"),
      role: "user",
      sessionID: input.sessionID,
      time: { created: Date.now() },
      tools: input.tools,
      agent: agent.name,
      model,
      system: input.system,
      variant: input.variant,
    }

    const parts: MessageV2.Part[] = input.parts.map((part) => ({
      ...part,
      id: part.id ?? Identifier.ascending("part"),
      messageID: info.id,
      sessionID: input.sessionID,
    })) as MessageV2.Part[]

    await Session.updateMessage(info)
    for (const part of parts) {
      await Session.updatePart(part)
    }

    return { info, parts }
  }
}
