import { z } from "zod"

// ---------------------------------------------------------------------------
// Agent definition schema
// ---------------------------------------------------------------------------

export const AgentInfoSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  mode: z.enum(["primary", "subagent"]),
  temperature: z.number().optional(),
  topP: z.number().optional(),
  prompt: z.string().optional(),
  permission: z.record(z.enum(["allow", "deny"])).default({ "*": "allow" }),
  maxSteps: z.number().int().positive().optional().default(25),
})

export type AgentInfo = z.infer<typeof AgentInfoSchema>

// ---------------------------------------------------------------------------
// Built-in agents
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_BASE = `你是 Salt Agent 中的 AI 助手，主要职责是帮助完成编码和文件操作任务。

## 工作规范
- 语气风格：不主动用 emoji、简洁直接、优先编辑而非新建文件
- 代码修改规范：编辑前必须先读取文件内容，不生成二进制内容
- 工具使用规范：优先用专用工具而非终端命令，独立操作可并行调用
- 请使用中文回复`

const BUILTIN_AGENTS: Record<string, AgentInfo> = {
  build: {
    name: "build",
    description: "默认 agent，可执行所有工具",
    mode: "primary",
    permission: { "*": "allow" },
    maxSteps: 25,
  },
  plan: {
    name: "plan",
    description: "只读分析模式，禁止编辑和执行",
    mode: "primary",
    permission: {
      "*": "allow",
      edit: "deny",
      write: "deny",
      bash: "deny",
    },
    maxSteps: 10,
  },
  explore: {
    name: "explore",
    description: "快速代码探索，只有读取和搜索权限",
    mode: "subagent",
    prompt:
      "You are a fast code exploration agent. Focus on finding relevant code quickly. " +
      "Use grep and glob for searching, read for viewing files. Be concise in your responses.",
    permission: {
      "*": "deny",
      read: "allow",
      grep: "allow",
      glob: "allow",
      ls: "allow",
    },
    maxSteps: 15,
  },
}

// ---------------------------------------------------------------------------
// Agent registry
// ---------------------------------------------------------------------------

export function listAgents(): AgentInfo[] {
  return Object.values(BUILTIN_AGENTS)
}

export function getAgent(name: string): AgentInfo | undefined {
  return BUILTIN_AGENTS[name]
}

export function getDefaultAgent(): AgentInfo {
  return BUILTIN_AGENTS["build"]!
}

export function getSystemPrompt(agent: AgentInfo): string {
  const parts = [SYSTEM_PROMPT_BASE]
  if (agent.prompt) {
    parts.push(agent.prompt)
  }
  return parts.join("\n\n")
}
