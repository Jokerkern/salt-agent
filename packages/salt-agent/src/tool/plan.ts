import z from "zod"
import { Tool } from "./tool.js"
import { Question } from "./question.js"
import { Session } from "../session/session.js"
import { MessageV2 } from "../session/message.js"
import { Identifier } from "../id/id.js"

const DESCRIPTION_ENTER = `切换到计划模式，在修改前进行研究与规划。

此工具将当前会话切换至计划代理，计划代理以只读模式运行。
计划代理可以研究代码、探索代码库并制定计划，但不能进行编辑。
计划完成后，使用 plan_exit 切换回构建代理。`

const DESCRIPTION_EXIT = `退出计划模式，切换至构建代理以开始实施。

此工具将当前会话切换回构建代理。
构建代理拥有完整权限，可以编辑文件、运行命令和进行修改。`

/** 获取会话中最后使用的模型 */
async function getLastModel(sessionID: string) {
  for await (const item of MessageV2.stream(sessionID)) {
    if (item.info.role === "user" && item.info.model) return item.info.model
  }
  const { Provider } = await import("../provider/provider.js")
  return Provider.defaultModel()
}

export const PlanExitTool = Tool.define("plan_exit", {
  description: DESCRIPTION_EXIT,
  parameters: z.object({}),
  async execute(_params, ctx) {
    const answers = await Question.ask({
      sessionID: ctx.sessionID,
      questions: [
        {
          question: "计划已完成。是否切换到构建代理开始实施？",
          header: "构建代理",
          options: [
            { label: "是", description: "切换到构建代理并开始实施计划" },
            { label: "否", description: "留在计划代理继续完善计划" },
          ],
        },
      ],
      tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
    })

    const answer = answers[0]?.[0]
    if (answer === "否") throw new Question.RejectedError()

    const model = await getLastModel(ctx.sessionID)

    // 创建合成用户消息以切换代理
    const userMsg: MessageV2.User = {
      id: Identifier.ascending("message"),
      sessionID: ctx.sessionID,
      role: "user",
      time: { created: Date.now() },
      agent: "build",
      model,
    }
    await Session.updateMessage(userMsg)
    await Session.updatePart({
      id: Identifier.ascending("part"),
      messageID: userMsg.id,
      sessionID: ctx.sessionID,
      type: "text",
      text: "计划已获批准，现在可以编辑文件。执行计划。",
      synthetic: true,
    } satisfies MessageV2.TextPart)

    return {
      title: "切换到构建代理",
      output: "用户已批准切换到构建代理。等待后续指令。",
      metadata: {},
    }
  },
})

export const PlanEnterTool = Tool.define("plan_enter", {
  description: DESCRIPTION_ENTER,
  parameters: z.object({}),
  async execute(_params, ctx) {
    const answers = await Question.ask({
      sessionID: ctx.sessionID,
      questions: [
        {
          question: "是否切换到计划代理进行研究和规划？",
          header: "计划模式",
          options: [
            { label: "是", description: "切换到计划代理进行研究和规划" },
            { label: "否", description: "留在构建代理继续修改" },
          ],
        },
      ],
      tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
    })

    const answer = answers[0]?.[0]
    if (answer === "否") throw new Question.RejectedError()

    const model = await getLastModel(ctx.sessionID)

    // 创建合成用户消息以切换代理
    const userMsg: MessageV2.User = {
      id: Identifier.ascending("message"),
      sessionID: ctx.sessionID,
      role: "user",
      time: { created: Date.now() },
      agent: "plan",
      model,
    }
    await Session.updateMessage(userMsg)
    await Session.updatePart({
      id: Identifier.ascending("part"),
      messageID: userMsg.id,
      sessionID: ctx.sessionID,
      type: "text",
      text: "用户已请求进入计划模式。切换到计划模式并开始规划。",
      synthetic: true,
    } satisfies MessageV2.TextPart)

    return {
      title: "切换到计划代理",
      output: "用户已确认切换到计划模式。新消息已创建以切换到计划模式。开始规划。",
      metadata: {},
    }
  },
})
