// ---------------------------------------------------------------------------
// Content blocks (matches backend ContentBlock)
// ---------------------------------------------------------------------------

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolCallBlock {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: unknown;
}

export interface ToolResultBlock {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}

export type ContentBlock = TextBlock | ToolCallBlock | ToolResultBlock;

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface SessionInfo {
  id: string;
  title: string;
  agent: string;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Message (persisted)
// ---------------------------------------------------------------------------

export interface MessageInfo {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool";
  content: ContentBlock[];
  tokensInput: number;
  tokensOutput: number;
  cost: number;
  modelId?: string;
  providerId?: string;
  finishReason?: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  envKey?: string;
}

export interface ProviderConfig {
  id: string;
  providerId: string;
  name: string;
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
  options?: string;
  isDefault: boolean;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Agent events from SSE stream
// ---------------------------------------------------------------------------

export type AgentEvent =
  | { type: "text-start" }
  | { type: "text-delta"; delta: string }
  | { type: "text-end"; text: string }
  | { type: "reasoning-start" }
  | { type: "reasoning-delta"; delta: string }
  | { type: "reasoning-end"; text: string }
  | { type: "tool-call-start"; toolName: string; toolCallId: string }
  | { type: "tool-call-args"; toolName: string; toolCallId: string; args: unknown }
  | { type: "tool-result"; toolName: string; toolCallId: string; result: unknown }
  | { type: "tool-error"; toolName: string; toolCallId: string; error: string }
  | { type: "step-finish"; finishReason: string; tokens?: { input: number; output: number } }
  | { type: "error"; error: string }
  | { type: "done"; finishReason: string };
