import { QuestionTool } from "./question.js"
import { BashTool } from "./bash.js"
import { EditTool } from "./edit.js"
import { GlobTool } from "./glob.js"
import { GrepTool } from "./grep.js"
import { ReadTool } from "./read.js"
import { TaskTool } from "./task.js"
import { TodoWriteTool, TodoReadTool } from "./todo.js"
import { WebFetchTool } from "./webfetch.js"
import { WriteTool } from "./write.js"
import { InvalidTool } from "./invalid.js"
import { SkillTool } from "./skill.js"
import { WebSearchTool } from "./websearch.js"
import { ListTool } from "./ls.js"
import { ApplyPatchTool } from "./apply-patch.js"
import { PlanEnterTool, PlanExitTool } from "./plan.js"
import { Tool } from "./tool.js"
import { Log } from "../util/log.js"

/**
 * Tool registry — manages all available tools.
 * Simplified from opencode: no plugin system, no custom tool scanning, no feature flags.
 */
export namespace ToolRegistry {
  const log = Log.create({ service: "tool.registry" })

  const customTools: Tool.Info[] = []

  export async function register(tool: Tool.Info) {
    const idx = customTools.findIndex((t) => t.id === tool.id)
    if (idx >= 0) {
      customTools.splice(idx, 1, tool)
      return
    }
    customTools.push(tool)
  }

  function all(): Tool.Info[] {
    return [
      InvalidTool,
      QuestionTool,
      BashTool,
      ReadTool,
      GlobTool,
      GrepTool,
      EditTool,
      WriteTool,
      ListTool,
      TaskTool,
      WebFetchTool,
      TodoWriteTool,
      TodoReadTool,
      WebSearchTool,
      SkillTool,
      ApplyPatchTool,
      PlanEnterTool,
      PlanExitTool,
      ...customTools,
    ]
  }

  export function ids() {
    return all().map((t) => t.id)
  }

  export async function tools(
    model: { providerID: string; modelID: string },
    agent?: Tool.InitContext["agent"],
  ) {
    const toolList = all()
    const result = await Promise.all(
      toolList
        .filter((t) => {
          // apply_patch only for specific models that use it (e.g. gpt- series)
          const usePatch =
            model.modelID.includes("gpt-") &&
            !model.modelID.includes("oss") &&
            !model.modelID.includes("gpt-4")
          if (t.id === "apply_patch") return usePatch
          if (t.id === "edit" || t.id === "write") return !usePatch

          return true
        })
        .map(async (t) => {
          using _ = log.time(t.id)
          return {
            id: t.id,
            ...(await t.init({ agent })),
          }
        }),
    )
    return result
  }
}
