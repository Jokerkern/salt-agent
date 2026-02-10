import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";

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
  /** Callback for each agent session event (includes compaction/retry events) */
  onAgentEvent?: (event: AgentSessionEvent) => void;
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
