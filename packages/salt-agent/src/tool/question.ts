import z from "zod"
import { Tool } from "./tool.js"
import { Bus } from "../bus/bus.js"
import { BusEvent } from "../bus/bus-event.js"
import { Identifier } from "../id/id.js"

/**
 * Question system — interactive user prompts via Bus events.
 */
export namespace Question {
  export const Info = z.object({
    question: z.string(),
    options: z.array(
      z.object({
        label: z.string(),
        description: z.string().optional(),
      }),
    ),
    header: z.string().optional(),
  })
  export type Info = z.infer<typeof Info>

  export type Answer = string[]

  export const Event = {
    Asked: BusEvent.define(
      "question.asked",
      z.object({
        id: z.string(),
        sessionID: z.string(),
        questions: z.array(Info),
        tool: z
          .object({
            messageID: z.string(),
            callID: z.string(),
          })
          .optional(),
      }),
    ),
    Answered: BusEvent.define(
      "question.answered",
      z.object({
        id: z.string(),
        sessionID: z.string(),
        answers: z.array(z.array(z.string())),
      }),
    ),
  }

  const pending: Record<
    string,
    { resolve: (answers: Answer[]) => void; reject: (err: Error) => void }
  > = {}

  // Listen for answers
  Bus.subscribe(Event.Answered, (event) => {
    const p = pending[event.properties.id]
    if (!p) return
    delete pending[event.properties.id]
    p.resolve(event.properties.answers)
  })

  export async function ask(input: {
    sessionID: string
    questions: Info[]
    tool?: { messageID: string; callID: string }
  }): Promise<Answer[]> {
    const id = Identifier.ascending("question")
    return new Promise<Answer[]>((resolve, reject) => {
      pending[id] = { resolve, reject }
      Bus.publish(Event.Asked, {
        id,
        sessionID: input.sessionID,
        questions: input.questions,
        tool: input.tool,
      })
    })
  }

  export class RejectedError extends Error {
    constructor() {
      super("用户拒绝了此交互。")
    }
  }
}

const DESCRIPTION = `向用户提出一个或多个问题并等待响应。

用法：
- 提供带选项的结构化问题
- 用户从提供的选项中选择
- 返回用户对所有问题的回答`

export const QuestionTool = Tool.define("question", {
  description: DESCRIPTION,
  parameters: z.object({
    questions: z
      .array(Question.Info)
      .describe("要向用户询问的问题"),
  }),
  async execute(params, ctx) {
    const answers = await Question.ask({
      sessionID: ctx.sessionID,
      questions: params.questions,
      tool: ctx.callID
        ? { messageID: ctx.messageID, callID: ctx.callID }
        : undefined,
    })

    function format(answer: Question.Answer | undefined) {
      if (!answer?.length) return "未回答"
      return answer.join(", ")
    }

    const formatted = params.questions
      .map((q, i) => `"${q.question}"="${format(answers[i])}"`)
      .join(", ")

    return {
      title: `已询问 ${params.questions.length} 个问题`,
      output: `用户已回答了你的问题：${formatted}。你可以根据用户的回答继续操作。`,
      metadata: { answers },
    }
  },
})
