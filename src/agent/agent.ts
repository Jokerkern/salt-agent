import type { ImageContent, Message, Model, TextContent } from "../ai/types.js";
import { streamSimple } from "../ai/index.js";
import { agentLoop, agentLoopContinue } from "./agent-loop.js";
import type {
  AgentContext,
  AgentEvent,
  AgentLoopConfig,
  AgentMessage,
  AgentState,
  AgentTool,
  StreamFn,
  ThinkingLevel,
} from "./types.js";

function defaultConvertToLlm(messages: AgentMessage[]): Message[] {
  return messages.filter((m) => m.role === "user" || m.role === "assistant" || m.role === "toolResult");
}

export interface AgentOptions {
  initialState?: Partial<AgentState>;
  convertToLlm?: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
  transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
  steeringMode?: "all" | "one-at-a-time";
  followUpMode?: "all" | "one-at-a-time";
  streamFn?: StreamFn;
  sessionId?: string;
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
}

export class Agent {
  private _state: AgentState = {
    systemPrompt: "",
    model: {
      id: "gpt-4o",
      name: "GPT-4o",
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      input: ["text", "image"],
      contextWindow: 128000,
      maxTokens: 16384,
    },
    thinkingLevel: "off",
    tools: [],
    messages: [],
    isStreaming: false,
    streamMessage: null,
    pendingToolCalls: new Set<string>(),
    error: undefined,
  };

  private listeners = new Set<(e: AgentEvent) => void>();
  private abortController?: AbortController;
  private convertToLlm: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
  private transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
  private steeringQueue: AgentMessage[] = [];
  private followUpQueue: AgentMessage[] = [];
  private steeringMode: "all" | "one-at-a-time";
  private followUpMode: "all" | "one-at-a-time";
  public streamFn: StreamFn;
  private _sessionId?: string;
  public getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
  private runningPrompt?: Promise<void>;
  private resolveRunningPrompt?: () => void;

  constructor(opts: AgentOptions = {}) {
    this._state = { ...this._state, ...opts.initialState };
    this.convertToLlm = opts.convertToLlm || defaultConvertToLlm;
    this.transformContext = opts.transformContext;
    this.steeringMode = opts.steeringMode || "one-at-a-time";
    this.followUpMode = opts.followUpMode || "one-at-a-time";
    this.streamFn = opts.streamFn || streamSimple;
    this._sessionId = opts.sessionId;
    this.getApiKey = opts.getApiKey;
  }

  get sessionId(): string | undefined {
    return this._sessionId;
  }

  set sessionId(value: string | undefined) {
    this._sessionId = value;
  }

  get state(): AgentState {
    return this._state;
  }

  subscribe(fn: (e: AgentEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setSystemPrompt(v: string) {
    this._state.systemPrompt = v;
  }

  setModel(m: Model) {
    this._state.model = m;
  }

  setThinkingLevel(l: ThinkingLevel) {
    this._state.thinkingLevel = l;
  }

  setTools(t: AgentTool<any>[]) {
    this._state.tools = t;
  }

  replaceMessages(ms: AgentMessage[]) {
    this._state.messages = ms.slice();
  }

  appendMessage(m: AgentMessage) {
    this._state.messages = [...this._state.messages, m];
  }

  steer(m: AgentMessage) {
    this.steeringQueue.push(m);
  }

  followUp(m: AgentMessage) {
    this.followUpQueue.push(m);
  }

  clearMessages() {
    this._state.messages = [];
  }

  abort() {
    this.abortController?.abort();
  }

  waitForIdle(): Promise<void> {
    return this.runningPrompt ?? Promise.resolve();
  }

  reset() {
    this._state.messages = [];
    this._state.isStreaming = false;
    this._state.streamMessage = null;
    this._state.pendingToolCalls = new Set<string>();
    this._state.error = undefined;
    this.steeringQueue = [];
    this.followUpQueue = [];
  }

  async prompt(message: AgentMessage | AgentMessage[]): Promise<void>;
  async prompt(input: string, images?: ImageContent[]): Promise<void>;
  async prompt(input: string | AgentMessage | AgentMessage[], images?: ImageContent[]) {
    if (this._state.isStreaming) {
      throw new Error("Agent 正在处理其他请求");
    }

    const model = this._state.model;
    if (!model) throw new Error("未配置模型");

    let msgs: AgentMessage[];

    if (Array.isArray(input)) {
      msgs = input;
    } else if (typeof input === "string") {
      const content: Array<TextContent | ImageContent> = [{ type: "text", text: input }];
      if (images && images.length > 0) {
        content.push(...images);
      }
      msgs = [
        {
          role: "user",
          content,
          timestamp: Date.now(),
        },
      ];
    } else {
      msgs = [input];
    }

    await this._runLoop(msgs);
  }

  async continue() {
    if (this._state.isStreaming) {
      throw new Error("Agent 正在处理其他请求");
    }

    const messages = this._state.messages;
    if (messages.length === 0) {
      throw new Error("没有可继续的消息");
    }
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === "assistant") {
      throw new Error("无法从助手消息继续");
    }

    await this._runLoop(undefined);
  }

  private dequeueSteeringMessages(): AgentMessage[] {
    if (this.steeringMode === "one-at-a-time") {
      if (this.steeringQueue.length > 0) {
        const first = this.steeringQueue[0]!;
        this.steeringQueue = this.steeringQueue.slice(1);
        return [first];
      }
      return [];
    }

    const steering = this.steeringQueue.slice();
    this.steeringQueue = [];
    return steering;
  }

  private dequeueFollowUpMessages(): AgentMessage[] {
    if (this.followUpMode === "one-at-a-time") {
      if (this.followUpQueue.length > 0) {
        const first = this.followUpQueue[0]!;
        this.followUpQueue = this.followUpQueue.slice(1);
        return [first];
      }
      return [];
    }

    const followUp = this.followUpQueue.slice();
    this.followUpQueue = [];
    return followUp;
  }

  private async _runLoop(messages?: AgentMessage[]) {
    const model = this._state.model;
    if (!model) throw new Error("未配置模型");

    this.runningPrompt = new Promise<void>((resolve) => {
      this.resolveRunningPrompt = resolve;
    });

    this.abortController = new AbortController();
    this._state.isStreaming = true;
    this._state.streamMessage = null;
    this._state.error = undefined;

    const reasoning = this._state.thinkingLevel === "off" ? undefined : this._state.thinkingLevel;

    const context: AgentContext = {
      systemPrompt: this._state.systemPrompt,
      messages: this._state.messages.slice(),
      tools: this._state.tools,
    };

    const config: AgentLoopConfig = {
      model,
      reasoning,
      convertToLlm: this.convertToLlm,
      transformContext: this.transformContext,
      getApiKey: this.getApiKey,
      getSteeringMessages: async () => this.dequeueSteeringMessages(),
      getFollowUpMessages: async () => this.dequeueFollowUpMessages(),
    };

    let partial: AgentMessage | null = null;

    try {
      const stream = messages
        ? agentLoop(messages, context, config, this.abortController.signal, this.streamFn)
        : agentLoopContinue(context, config, this.abortController.signal, this.streamFn);

      for await (const event of stream) {
        switch (event.type) {
          case "message_start":
            partial = event.message;
            this._state.streamMessage = event.message;
            break;

          case "message_update":
            partial = event.message;
            this._state.streamMessage = event.message;
            break;

          case "message_end":
            partial = null;
            this._state.streamMessage = null;
            this.appendMessage(event.message);
            break;

          case "tool_execution_start": {
            const s = new Set(this._state.pendingToolCalls);
            s.add(event.toolCallId);
            this._state.pendingToolCalls = s;
            break;
          }

          case "tool_execution_end": {
            const s = new Set(this._state.pendingToolCalls);
            s.delete(event.toolCallId);
            this._state.pendingToolCalls = s;
            break;
          }

          case "turn_end":
            if (event.message.role === "assistant" && (event.message as any).errorMessage) {
              this._state.error = (event.message as any).errorMessage;
            }
            break;

          case "agent_end":
            this._state.isStreaming = false;
            this._state.streamMessage = null;
            break;
        }

        this.emit(event);
      }

      if (partial && partial.role === "assistant" && partial.content.length > 0) {
        this.appendMessage(partial);
      }
    } catch (err: any) {
      const errorMsg: AgentMessage = {
        role: "assistant",
        content: [{ type: "text", text: "" }],
        api: "openai-completions",
        provider: model.provider,
        model: model.id,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: this.abortController?.signal.aborted ? "aborted" : "error",
        errorMessage: err?.message || String(err),
        timestamp: Date.now(),
      } as AgentMessage;

      this.appendMessage(errorMsg);
      this._state.error = err?.message || String(err);
      this.emit({ type: "agent_end", messages: [errorMsg] });
    } finally {
      this._state.isStreaming = false;
      this._state.streamMessage = null;
      this._state.pendingToolCalls = new Set<string>();
      this.abortController = undefined;
      this.resolveRunningPrompt?.();
      this.runningPrompt = undefined;
      this.resolveRunningPrompt = undefined;
    }
  }

  private emit(e: AgentEvent) {
    for (const listener of this.listeners) {
      listener(e);
    }
  }
}
