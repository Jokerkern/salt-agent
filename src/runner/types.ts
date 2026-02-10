import type { AgentEvent, AgentMessage } from "@mariozechner/pi-agent-core";

export interface RunAgentParams {
  sessionId: string;
  sessionFile: string;
  prompt: string;
  systemPrompt: string;
  /** OpenAI API key */
  apiKey: string;
  /** OpenAI base URL */
  baseUrl: string;
  /** Model ID (from SettingsManager or default) */
  modelId: string;
  /** Agent config directory */
  agentDir: string;
  /** Working directory */
  cwd: string;
  /** Timeout in ms */
  timeoutMs?: number;
  /** Abort signal */
  abortSignal?: AbortSignal;
  /** Callback for each agent event (for SSE streaming) */
  onAgentEvent?: (event: AgentEvent) => void;
  /** Callback when a user message is persisted (for title update) */
  onUserMessage?: (message: AgentMessage) => void;
}

export interface RunAgentResult {
  /** Whether the run was aborted */
  aborted: boolean;
  /** The session ID used */
  sessionId: string;
  /** Duration in ms */
  durationMs: number;
  /** Final assistant text (for IM callback) */
  assistantText?: string;
  /** Error if any */
  error?: string;
}

export interface RunHandle {
  abort: () => void;
  isStreaming: () => boolean;
}
