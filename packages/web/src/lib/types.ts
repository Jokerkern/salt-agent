// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface SessionInfo {
  id: string
  title: string
  parentID?: string
  permission?: PermissionRule[]
  time: {
    created: number
    updated: number
  }
}

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

export interface MessageUser {
  id: string
  sessionID: string
  role: "user"
  time: { created: number }
  agent: string
  model: { providerID: string; modelID: string }
  system?: string
  tools?: Record<string, boolean>
  variant?: string
}

export interface MessageAssistant {
  id: string
  sessionID: string
  role: "assistant"
  time: { created: number; completed?: number }
  error?: { name: string; message?: string; [key: string]: unknown }
  parentID: string
  modelID: string
  providerID: string
  mode: string
  agent: string
  path: { cwd: string; root: string }
  summary?: boolean
  cost: number
  tokens: {
    total?: number
    input: number
    output: number
    reasoning: number
    cache: { read: number; write: number }
  }
  structured?: unknown
  variant?: string
  finish?: string
}

export type MessageInfo = MessageUser | MessageAssistant

// ---------------------------------------------------------------------------
// Message Parts
// ---------------------------------------------------------------------------

interface PartBase {
  id: string
  sessionID: string
  messageID: string
}

export interface TextPart extends PartBase {
  type: "text"
  text: string
  synthetic?: boolean
  ignored?: boolean
  time?: { start: number; end?: number }
  metadata?: Record<string, unknown>
}

export interface ReasoningPart extends PartBase {
  type: "reasoning"
  text: string
  metadata?: Record<string, unknown>
  time: { start: number; end?: number }
}

export interface FilePart extends PartBase {
  type: "file"
  mime: string
  url: string
}

export interface ToolStatePending {
  status: "pending"
  input: Record<string, unknown>
  raw: string
}

export interface ToolStateRunning {
  status: "running"
  input: Record<string, unknown>
  title?: string
  metadata?: Record<string, unknown>
  time: { start: number }
}

export interface ToolStateCompleted {
  status: "completed"
  input: Record<string, unknown>
  output: string
  title: string
  metadata: Record<string, unknown>
  attachments?: FilePart[]
  time: { start: number; end: number; compacted?: number }
}

export interface ToolStateError {
  status: "error"
  input: Record<string, unknown>
  error: string
  metadata?: Record<string, unknown>
  time: { start: number; end: number }
}

export type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError

export interface ToolPart extends PartBase {
  type: "tool"
  callID: string
  tool: string
  state: ToolState
  metadata?: Record<string, unknown>
}

export type MessagePart = TextPart | ReasoningPart | ToolPart | FilePart

export interface MessageWithParts {
  info: MessageInfo
  parts: MessagePart[]
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface ProviderModel {
  id: string
  providerID: string
  name: string
  family?: string
  capabilities: {
    temperature: boolean
    reasoning: boolean
    attachment: boolean
    toolcall: boolean
    input: { text: boolean; image: boolean; audio: boolean; video: boolean; pdf: boolean }
    output: { text: boolean; image: boolean; audio: boolean; video: boolean; pdf: boolean }
  }
  cost: {
    input: number
    output: number
    cache: { read: number; write: number }
  }
  limit: {
    context: number
    input?: number
    output: number
  }
  status: "alpha" | "beta" | "deprecated" | "active"
}

export interface ProviderInfo {
  id: string
  name: string
  source: "env" | "config" | "custom" | "builtin"
  env: string[]
  key?: string
  options: Record<string, unknown>
  models: Record<string, ProviderModel>
}

export interface ProviderListResponse {
  all: ProviderInfo[]
  default: Record<string, string>
  connected: string[]
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface ConfigProvider {
  name?: string
  env?: string[]
  npm?: string
  api?: string
  options?: {
    apiKey?: string
    baseURL?: string
    [key: string]: unknown
  }
  models?: Record<string, Record<string, unknown>>
}

export interface ConfigInfo {
  model?: string
  small_model?: string
  provider?: Record<string, ConfigProvider>
}

// ---------------------------------------------------------------------------
// Permission
// ---------------------------------------------------------------------------

export interface PermissionRule {
  permission: string
  pattern: string
  action: "allow" | "deny" | "ask"
}

export interface PermissionRequest {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  metadata: Record<string, unknown>
  always: string[]
  tool?: { messageID: string; callID: string }
}

export type PermissionReply = "once" | "always" | "reject"

// ---------------------------------------------------------------------------
// Question
// ---------------------------------------------------------------------------

export interface QuestionOption {
  label: string
  description?: string
}

export interface QuestionInfo {
  question: string
  options: QuestionOption[]
  header?: string
}

export interface QuestionRequest {
  id: string
  sessionID: string
  questions: QuestionInfo[]
  tool?: { messageID: string; callID: string }
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export interface AgentInfo {
  name: string
  description?: string
  mode: "subagent" | "primary" | "all"
  hidden?: boolean
  temperature?: number
  topP?: number
  prompt?: string
  permission: PermissionRule[]
  model?: { modelID: string; providerID: string }
  variant?: string
  options: Record<string, unknown>
  steps?: number
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export type AuthInfo =
  | { type: "api"; key: string }
  | { type: "oauth"; refresh: string; access: string; expires: number; accountId?: string }

// ---------------------------------------------------------------------------
// Session Status
// ---------------------------------------------------------------------------

export type SessionStatusInfo =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string; next: number }

// ---------------------------------------------------------------------------
// SSE Events
// ---------------------------------------------------------------------------

export type SSEEvent =
  | { type: "server.connected"; properties: Record<string, never> }
  | { type: "server.heartbeat"; properties: Record<string, never> }
  | { type: "session.created"; properties: { info: SessionInfo } }
  | { type: "session.updated"; properties: { info: SessionInfo } }
  | { type: "session.deleted"; properties: { info: SessionInfo } }
  | { type: "session.error"; properties: { sessionID: string; error: unknown } }
  | { type: "session.status"; properties: { sessionID: string; status: SessionStatusInfo } }
  | { type: "message.updated"; properties: { info: MessageInfo } }
  | { type: "message.removed"; properties: { sessionID: string; messageID: string } }
  | { type: "message.part.updated"; properties: { part: MessagePart; delta?: string } }
  | { type: "message.part.removed"; properties: { sessionID: string; messageID: string; partID: string } }
  | { type: "config.updated"; properties: { config: ConfigInfo } }
  | { type: "auth.updated"; properties: { providerID: string } }
  | { type: "permission.asked"; properties: PermissionRequest }
  | { type: "permission.replied"; properties: { sessionID: string; requestID: string; reply: PermissionReply } }
  | { type: "question.asked"; properties: QuestionRequest }
  | { type: "question.answered"; properties: { id: string; sessionID: string; answers: string[][] } }

// ---------------------------------------------------------------------------
// Prompt Input (for sending messages)
// ---------------------------------------------------------------------------

export interface PromptInput {
  parts: Array<
    | { type: "text"; text: string; id?: string }
    | { type: "file"; mime: string; url: string; id?: string }
  >
  model?: { providerID: string; modelID: string }
  agent?: string
  noReply?: boolean
  tools?: Record<string, boolean>
  system?: string
  variant?: string
}
