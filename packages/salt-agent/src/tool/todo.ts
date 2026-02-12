import z from "zod"
import { Tool } from "./tool.js"
import { Storage } from "../storage/storage.js"

const TodoInfo = z.object({
  id: z.string(),
  content: z.string(),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
})

async function getTodos(sessionID: string) {
  return Storage.read<z.infer<typeof TodoInfo>[]>(["todo", sessionID]).catch(
    () => [],
  )
}

async function setTodos(
  sessionID: string,
  todos: z.infer<typeof TodoInfo>[],
) {
  await Storage.write(["todo", sessionID], todos)
}

const WRITE_DESCRIPTION = `为当前会话创建并管理结构化任务列表。

用法：
- 适用复杂多步骤任务（3 步及以上）
- 每个待办：id、content、status（pending/in_progress/completed/cancelled）
- 同时仅应有一个任务处于 in_progress
- 完成时及时标记任务完成`

export const TodoWriteTool = Tool.define("todowrite", {
  description: WRITE_DESCRIPTION,
  parameters: z.object({
    todos: z
      .array(z.object(TodoInfo.shape))
      .describe("更新后的待办列表"),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "todowrite",
      patterns: ["*"],
      always: ["*"],
      metadata: {},
    })

    await setTodos(ctx.sessionID, params.todos)
    return {
      title: `${params.todos.filter((x) => x.status !== "completed").length} todos`,
      output: JSON.stringify(params.todos, null, 2),
      metadata: { todos: params.todos },
    }
  },
})

export const TodoReadTool = Tool.define("todoread", {
  description: "使用此工具读取待办列表",
  parameters: z.object({}),
  async execute(_params, ctx) {
    await ctx.ask({
      permission: "todoread",
      patterns: ["*"],
      always: ["*"],
      metadata: {},
    })

    const todos = await getTodos(ctx.sessionID)
    return {
      title: `${todos.filter((x) => x.status !== "completed").length} todos`,
      metadata: { todos },
      output: JSON.stringify(todos, null, 2),
    }
  },
})
