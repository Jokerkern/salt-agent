import z from "zod"
import { Tool } from "./tool.js"
import { Session } from "../session/session.js"
import { MessageV2 } from "../session/message.js"
import { Identifier } from "../id/id.js"
import { Agent } from "../agent/agent.js"
import { SessionPrompt } from "../session/prompt.js"
import { Permission } from "../permission/permission.js"

const DESCRIPTION = `启动子代理以自主处理复杂多步骤任务。

用法：
- 提供任务描述和提示
- 子代理在独立会话中运行，权限受限
- 返回子代理的最终文本响应
- 可通过 task_id 恢复先前的任务

可用代理：
{agents}`

const parameters = z.object({
  description: z
    .string()
    .describe("任务的简短描述（3–5 个字）"),
  prompt: z.string().describe("代理要执行的任务"),
  subagent_type: z
    .string()
    .describe("用于此任务的专用代理类型"),
  task_id: z
    .string()
    .describe("传入之前的 task_id 以恢复先前任务")
    .optional(),
})

export const TaskTool = Tool.define("task", async (ctx) => {
  const agents = await Agent.list().then((x) => x.filter((a) => a.mode !== "primary"))

  // 按调用者权限过滤可用代理
  const caller = ctx?.agent
  const accessibleAgents = caller
    ? agents.filter((a) => Permission.evaluate("task", a.name, caller.permission ?? []).action !== "deny")
    : agents

  const description = DESCRIPTION.replace(
    "{agents}",
    accessibleAgents
      .map((a) => `- ${a.name}: ${a.description ?? "此子代理只能由用户手动调用。"}`)
      .join("\n"),
  )

  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      // 用户通过 @ 显式指定代理时跳过权限检查
      if (!ctx.extra?.bypassAgentCheck) {
        await ctx.ask({
          permission: "task",
          patterns: [params.subagent_type],
          always: ["*"],
          metadata: {
            description: params.description,
            subagent_type: params.subagent_type,
          },
        })
      }

      const agent = await Agent.get(params.subagent_type)
      if (!agent) throw new Error(`未知的代理类型: ${params.subagent_type} 不是有效的代理类型`)

      const hasTaskPermission = agent.permission.some((rule) => rule.permission === "task")

      // 创建或恢复会话
      let session: Session.Info
      if (params.task_id) {
        const found = await Session.get(params.task_id).catch(() => undefined)
        session = found ?? await createChildSession(ctx.sessionID, agent, params.description, hasTaskPermission)
      } else {
        session = await createChildSession(ctx.sessionID, agent, params.description, hasTaskPermission)
      }

      // 从调用者的助手消息获取模型
      const msg = await MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID })
      const model = agent.model ?? (msg.info.role === "assistant"
        ? { modelID: msg.info.modelID, providerID: msg.info.providerID }
        : await Provider_defaultModel())

      ctx.metadata({
        title: params.description,
        metadata: { sessionId: session.id, model },
      })

      const messageID = Identifier.ascending("message")

      // 中断信号传播
      const abortHandler = () => SessionPrompt.cancel(session.id)
      ctx.abort.addEventListener("abort", abortHandler)

      try {
        const result = await SessionPrompt.prompt({
          messageID,
          sessionID: session.id,
          model: { modelID: model.modelID, providerID: model.providerID },
          agent: agent.name,
          tools: {
            todowrite: false,
            todoread: false,
            ...(hasTaskPermission ? {} : { task: false }),
          },
          parts: [{ type: "text", text: params.prompt }],
        })

        const text = result.parts.findLast((x) => x.type === "text")
        const textContent = text && "text" in text ? text.text : ""

        const output = [
          `task_id: ${session.id}（如需恢复可传入此 ID 继续任务）`,
          "",
          "<task_result>",
          textContent,
          "</task_result>",
        ].join("\n")

        return {
          title: params.description,
          metadata: { sessionId: session.id, model },
          output,
        }
      } finally {
        ctx.abort.removeEventListener("abort", abortHandler)
      }
    },
  }
})

/** 创建子会话，附加限制权限 */
async function createChildSession(
  parentID: string,
  agent: Agent.Info,
  description: string,
  hasTaskPermission: boolean,
): Promise<Session.Info> {
  return Session.create({
    parentID,
    title: description + ` (@${agent.name} 子代理)`,
    permission: [
      { permission: "todowrite", pattern: "*", action: "deny" },
      { permission: "todoread", pattern: "*", action: "deny" },
      ...(hasTaskPermission
        ? []
        : [{ permission: "task" as const, pattern: "*" as const, action: "deny" as const }]),
    ],
  })
}

// 延迟导入避免循环依赖
async function Provider_defaultModel() {
  const { Provider } = await import("../provider/provider.js")
  return Provider.defaultModel()
}
