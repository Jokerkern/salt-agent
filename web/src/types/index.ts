export interface SessionMetadata {
  id: string;
  title?: string;
  updatedAt: number;
}

export interface Message {
  role: "user" | "assistant" | "toolResult";
  content: any;
  timestamp: number;
  model?: string;
  usage?: any;
  stopReason?: string;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
}

export interface AgentEvent {
  type: string;
  message?: Message;
  assistantMessageEvent?: any;
  toolCallId?: string;
  toolName?: string;
  args?: any;
  result?: any;
  partialResult?: any;
  isError?: boolean;
}

