import { streamSimple } from "@mariozechner/pi-ai";
import {
  createAgentSession,
  SessionManager,
  SettingsManager,
  AuthStorage,
  ModelRegistry,
} from "@mariozechner/pi-coding-agent";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import type { Model } from "@mariozechner/pi-ai";
import { DEFAULT_TOOLS } from "../tools/index.js";
import { setActiveRun, clearActiveRun } from "./runs.js";
import type { RunAgentParams, RunAgentResult, RunHandle } from "./types.js";

/**
 * Run an agent session: create a pi-coding-agent session, prompt it,
 * stream events via callbacks, and return the result.
 *
 * Modeled after openclaw's runEmbeddedAttempt pattern.
 */
export async function runAgent(params: RunAgentParams): Promise<RunAgentResult> {
  const started = Date.now();
  let aborted = false;

  const runAbortController = new AbortController();

  // Wire up external abort signal
  if (params.abortSignal) {
    if (params.abortSignal.aborted) {
      aborted = true;
      runAbortController.abort();
    } else {
      params.abortSignal.addEventListener("abort", () => {
        aborted = true;
        runAbortController.abort();
      }, { once: true });
    }
  }

  // Setup timeout
  const timeoutMs = params.timeoutMs ?? 5 * 60 * 1000; // 5 min default
  const timeoutTimer = setTimeout(() => {
    aborted = true;
    runAbortController.abort();
  }, timeoutMs);

  // Open pi-coding-agent's SessionManager for this session file
  const sessionManager = SessionManager.open(params.sessionFile);

  // Create SettingsManager from agentDir
  const settingsManager = SettingsManager.create(params.cwd, params.agentDir);

  // Setup auth: inject OpenAI API key into AuthStorage
  const authStorage = new AuthStorage();
  authStorage.setRuntimeApiKey("openai", params.apiKey);

  // Setup model registry
  const modelRegistry = new ModelRegistry(authStorage);

  // Resolve model
  const modelId = params.modelId || settingsManager.getDefaultModel() || "gpt-4o";
  const model: Model<any> = {
    id: modelId,
    name: modelId,
    provider: "openai",
    api: "openai-completions",
    baseUrl: params.baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384,
  };

  // Create the agent session
  const { session } = await createAgentSession({
    cwd: params.cwd,
    agentDir: params.agentDir,
    authStorage,
    modelRegistry,
    model,
    thinkingLevel: settingsManager.getDefaultThinkingLevel() ?? "off",
    tools: DEFAULT_TOOLS as AgentTool[],
    sessionManager,
    settingsManager,
  });

  // Override system prompt
  session.agent.setSystemPrompt(params.systemPrompt);

  // Force streamSimple as the stream function
  session.agent.streamFn = streamSimple;

  // Override getApiKey to always return the configured key
  session.agent.getApiKey = async () => params.apiKey;

  // Track active run
  const handle: RunHandle = {
    abort: () => {
      aborted = true;
      runAbortController.abort();
      void session.abort();
    },
    isStreaming: () => session.isStreaming,
  };
  setActiveRun(params.sessionId, handle);

  // Subscribe to AgentSession events (includes AgentEvent + compaction/retry events)
  let assistantText = "";
  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    // Forward all events to caller
    params.onAgentEvent?.(event as any);

    // Collect assistant text for IM response
    if (event.type === "message_end" && event.message.role === "assistant") {
      const textContent = (event.message as any).content?.filter?.((c: any) => c.type === "text");
      if (textContent) {
        assistantText = textContent.map((c: any) => c.text).join("\n");
      }
    }

    // Notify on user message (for title update)
    if (event.type === "message_end" && event.message.role === "user") {
      params.onUserMessage?.(event.message);
    }
  });

  let error: string | undefined;

  try {
    await session.prompt(params.prompt);
  } catch (err: any) {
    if (!aborted) {
      error = err?.message || String(err);
    }
  } finally {
    clearTimeout(timeoutTimer);
    unsubscribe();
    clearActiveRun(params.sessionId, handle);
    session.dispose();
  }

  return {
    aborted,
    sessionId: params.sessionId,
    durationMs: Date.now() - started,
    assistantText: assistantText || undefined,
    error,
  };
}
