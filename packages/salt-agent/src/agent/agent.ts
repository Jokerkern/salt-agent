import z from "zod"
import { Permission } from "../permission/permission.js"
import { Truncate } from "../tool/truncation.js"
import { lazy } from "../util/lazy.js"

/**
 * Agent 命名空间 — 定义代理配置，包含工具、权限和提示词。
 * 移植自 opencode 的 Agent 命名空间。
 */
export namespace Agent {
  export const Info = z.object({
    name: z.string(),
    description: z.string().optional(),
    mode: z.enum(["subagent", "primary", "all"]),
    hidden: z.boolean().optional(),
    temperature: z.number().optional(),
    topP: z.number().optional(),
    prompt: z.string().optional(),
    permission: Permission.Ruleset,
    model: z
      .object({
        modelID: z.string(),
        providerID: z.string(),
      })
      .optional(),
    variant: z.string().optional(),
    options: z.record(z.string(), z.any()),
    steps: z.number().int().positive().optional(),
  })
  export type Info = z.infer<typeof Info>

  const state = lazy(async () => {
    const defaults = Permission.fromConfig({
      "*": "allow",
      doom_loop: "ask",
      delete: "ask",
      external_directory: {
        "*": "ask",
        [Truncate.GLOB]: "allow",
      },
      question: "deny",
      plan_enter: "deny",
      plan_exit: "deny",
      read: {
        "*": "allow",
        "*.env": "ask",
        "*.env.*": "ask",
        "*.env.example": "allow",
      },
    })

    const result: Record<string, Info> = {
      build: {
        name: "build",
        description: "默认代理。根据已配置的权限执行工具。",
        options: {},
        permission: Permission.merge(
          defaults,
          Permission.fromConfig({
            question: "allow",
            plan_enter: "allow",
          }),
        ),
        mode: "primary",
      },
      plan: {
        name: "plan",
        description: "计划模式。禁用所有编辑类工具。",
        options: {},
        permission: Permission.merge(
          defaults,
          Permission.fromConfig({
            question: "allow",
            plan_exit: "allow",
            edit: { "*": "deny" },
            write: { "*": "deny" },
            bash: { "*": "deny" },
          }),
        ),
        mode: "primary",
      },
      general: {
        name: "general",
        description:
          "通用代理，用于研究复杂问题和执行多步骤任务。可用于并行执行多个工作单元。",
        permission: Permission.merge(
          defaults,
          Permission.fromConfig({
            todoread: "deny",
            todowrite: "deny",
          }),
        ),
        options: {},
        mode: "subagent",
      },
      explore: {
        name: "explore",
        description:
          '快速探索代理，专用于浏览代码库。当需要按模式查找文件（如 "src/components/**/*.tsx"）、搜索关键字（如 "API endpoints"）、或回答代码库相关问题时使用。',
        permission: Permission.merge(
          defaults,
          Permission.fromConfig({
            "*": "deny",
            grep: "allow",
            glob: "allow",
            list: "allow",
            bash: "allow",
            webfetch: "allow",
            websearch: "allow",
            read: "allow",
            external_directory: {
              [Truncate.GLOB]: "allow",
            },
          }),
        ),
        options: {},
        mode: "subagent",
      },
    }

    return result
  })

  export async function get(agent: string): Promise<Info> {
    const agents = await state()
    const found = agents[agent]
    if (!found) throw new Error(`找不到代理: "${agent}"`)
    return found
  }

  export async function list(): Promise<Info[]> {
    const agents = await state()
    return Object.values(agents)
  }

  export async function defaultAgent(): Promise<string> {
    return "build"
  }

  /** 重置缓存状态。仅用于测试。 */
  export function reset() {
    state.reset()
  }
}
