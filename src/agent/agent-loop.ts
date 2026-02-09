import { EventStream } from "../ai/event-stream.js";
import type {
  AssistantMessage,
  Context,
  ToolResultMessage,
} from "../ai/types.js";
import { streamSimple } from "../ai/index.js";
import type {
  AgentContext,
  AgentEvent,
  AgentLoopConfig,
  AgentMessage,
  AgentTool,
  AgentToolResult,
  StreamFn,
} from "./types.js";

export function agentLoop(
  prompts: AgentMessage[],
  context: AgentContext,
  config: AgentLoopConfig,
  signal?: AbortSignal,
  streamFn?: StreamFn,
): EventStream<AgentEvent, AgentMessage[]> {
  const stream = createAgentStream();

  (async () => {
    const newMessages: AgentMessage[] = [...prompts];
    const currentContext: AgentContext = {
      ...context,
      messages: [...context.messages, ...prompts],
    };

    stream.push({ type: "agent_start" });
    stream.push({ type: "turn_start" });
    for (const prompt of prompts) {
      stream.push({ type: "message_start", message: prompt });
      stream.push({ type: "message_end", message: prompt });
    }

    await runLoop(currentContext, newMessages, config, signal, stream, streamFn);
  })();

  return stream;
}

export function agentLoopContinue(
  context: AgentContext,
  config: AgentLoopConfig,
  signal?: AbortSignal,
  streamFn?: StreamFn,
): EventStream<AgentEvent, AgentMessage[]> {
  if (context.messages.length === 0) {
    throw new Error("无法继续: 上下文中没有消息");
  }

  const lastMessage = context.messages[context.messages.length - 1];
  if (lastMessage?.role === "assistant") {
    throw new Error("无法从助手消息继续");
  }

  const stream = createAgentStream();

  (async () => {
    const newMessages: AgentMessage[] = [];
    const currentContext: AgentContext = { ...context };

    stream.push({ type: "agent_start" });
    stream.push({ type: "turn_start" });

    await runLoop(currentContext, newMessages, config, signal, stream, streamFn);
  })();

  return stream;
}

function createAgentStream(): EventStream<AgentEvent, AgentMessage[]> {
  return new EventStream<AgentEvent, AgentMessage[]>(
    (event: AgentEvent) => event.type === "agent_end",
    (event: AgentEvent) => (event.type === "agent_end" ? event.messages : []),
  );
}

async function runLoop(
  currentContext: AgentContext,
  newMessages: AgentMessage[],
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  stream: EventStream<AgentEvent, AgentMessage[]>,
  streamFn?: StreamFn,
): Promise<void> {
  let firstTurn = true;
  let pendingMessages: AgentMessage[] = (await config.getSteeringMessages?.()) || [];

  while (true) {
    let hasMoreToolCalls = true;
    let steeringAfterTools: AgentMessage[] | null = null;

    while (hasMoreToolCalls || pendingMessages.length > 0) {
      if (!firstTurn) {
        stream.push({ type: "turn_start" });
      } else {
        firstTurn = false;
      }

      if (pendingMessages.length > 0) {
        for (const message of pendingMessages) {
          stream.push({ type: "message_start", message });
          stream.push({ type: "message_end", message });
          currentContext.messages.push(message);
          newMessages.push(message);
        }
        pendingMessages = [];
      }

      const message = await streamAssistantResponse(currentContext, config, signal, stream, streamFn);
      newMessages.push(message);

      if (message.stopReason === "error" || message.stopReason === "aborted") {
        stream.push({ type: "turn_end", message, toolResults: [] });
        stream.push({ type: "agent_end", messages: newMessages });
        stream.end(newMessages);
        return;
      }

      const toolCalls = message.content.filter((c) => c.type === "toolCall");
      hasMoreToolCalls = toolCalls.length > 0;

      const toolResults: ToolResultMessage[] = [];
      if (hasMoreToolCalls) {
        const toolExecution = await executeToolCalls(
          currentContext.tools,
          message,
          signal,
          stream,
          config.getSteeringMessages,
        );
        toolResults.push(...toolExecution.toolResults);
        steeringAfterTools = toolExecution.steeringMessages ?? null;

        for (const result of toolResults) {
          currentContext.messages.push(result);
          newMessages.push(result);
        }
      }

      stream.push({ type: "turn_end", message, toolResults });

      if (steeringAfterTools && steeringAfterTools.length > 0) {
        pendingMessages = steeringAfterTools;
        steeringAfterTools = null;
      } else {
        pendingMessages = (await config.getSteeringMessages?.()) || [];
      }
    }

    const followUpMessages = (await config.getFollowUpMessages?.()) || [];
    if (followUpMessages.length > 0) {
      pendingMessages = followUpMessages;
      continue;
    }

    break;
  }

  stream.push({ type: "agent_end", messages: newMessages });
  stream.end(newMessages);
}

async function streamAssistantResponse(
  context: AgentContext,
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  stream: EventStream<AgentEvent, AgentMessage[]>,
  streamFn?: StreamFn,
): Promise<AssistantMessage> {
  let messages = context.messages;
  if (config.transformContext) {
    messages = await config.transformContext(messages, signal);
  }

  const llmMessages = await config.convertToLlm(messages);

  const llmContext: Context = {
    systemPrompt: context.systemPrompt,
    messages: llmMessages,
    tools: context.tools,
  };

  const streamFunction = streamFn || streamSimple;

  const resolvedApiKey =
    (config.getApiKey ? await config.getApiKey(config.model.provider) : undefined) || config.apiKey;

  const response = await streamFunction(config.model, llmContext, {
    ...config,
    apiKey: resolvedApiKey,
    signal,
  });

  let partialMessage: AssistantMessage | null = null;
  let addedPartial = false;

  for await (const event of response) {
    switch (event.type) {
      case "start":
        partialMessage = event.partial;
        context.messages.push(partialMessage);
        addedPartial = true;
        stream.push({ type: "message_start", message: { ...partialMessage } });
        break;

      case "text_start":
      case "text_delta":
      case "text_end":
      case "thinking_start":
      case "thinking_delta":
      case "thinking_end":
      case "toolcall_start":
      case "toolcall_delta":
      case "toolcall_end":
        if (partialMessage) {
          partialMessage = event.partial;
          context.messages[context.messages.length - 1] = partialMessage;
          stream.push({
            type: "message_update",
            assistantMessageEvent: event,
            message: { ...partialMessage },
          });
        }
        break;

      case "done":
      case "error": {
        const finalMessage = await response.result();
        if (addedPartial) {
          context.messages[context.messages.length - 1] = finalMessage;
        } else {
          context.messages.push(finalMessage);
        }
        if (!addedPartial) {
          stream.push({ type: "message_start", message: { ...finalMessage } });
        }
        stream.push({ type: "message_end", message: finalMessage });
        return finalMessage;
      }
    }
  }

  return await response.result();
}

async function executeToolCalls(
  tools: AgentTool<any>[] | undefined,
  assistantMessage: AssistantMessage,
  signal: AbortSignal | undefined,
  stream: EventStream<AgentEvent, AgentMessage[]>,
  getSteeringMessages?: AgentLoopConfig["getSteeringMessages"],
): Promise<{ toolResults: ToolResultMessage[]; steeringMessages?: AgentMessage[] }> {
  const toolCalls = assistantMessage.content.filter((c) => c.type === "toolCall");
  const results: ToolResultMessage[] = [];
  let steeringMessages: AgentMessage[] | undefined;

  for (let index = 0; index < toolCalls.length; index++) {
    const toolCall = toolCalls[index]!;
    const tool = tools?.find((t) => t.name === toolCall.name);

    stream.push({
      type: "tool_execution_start",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      args: toolCall.arguments,
    });

    let result: AgentToolResult<any>;
    let isError = false;

    try {
      if (!tool) throw new Error(`工具 ${toolCall.name} 未找到`);

      result = await tool.execute(toolCall.id, toolCall.arguments, signal, (partialResult) => {
        stream.push({
          type: "tool_execution_update",
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          args: toolCall.arguments,
          partialResult,
        });
      });
    } catch (e) {
      result = {
        content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
        details: {},
      };
      isError = true;
    }

    stream.push({
      type: "tool_execution_end",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      result,
      isError,
    });

    const toolResultMessage: ToolResultMessage = {
      role: "toolResult",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content: result.content,
      details: result.details,
      isError,
      timestamp: Date.now(),
    };

    results.push(toolResultMessage);
    stream.push({ type: "message_start", message: toolResultMessage });
    stream.push({ type: "message_end", message: toolResultMessage });

    if (getSteeringMessages) {
      const steering = await getSteeringMessages();
      if (steering.length > 0) {
        steeringMessages = steering;
        const remainingCalls = toolCalls.slice(index + 1);
      for (const skipped of remainingCalls) {
        if (skipped) {
          results.push(skipToolCall(skipped as any, stream));
        }
      }
        break;
      }
    }
  }

  return { toolResults: results, steeringMessages };
}

function skipToolCall(
  toolCall: Extract<AssistantMessage["content"][number], { type: "toolCall" }>,
  stream: EventStream<AgentEvent, AgentMessage[]>,
): ToolResultMessage {
  const result: AgentToolResult<any> = {
    content: [{ type: "text", text: "由于用户消息中断，已跳过执行。" }],
    details: {},
  };

  stream.push({
    type: "tool_execution_start",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    args: toolCall.arguments,
  });
  stream.push({
    type: "tool_execution_end",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    result,
    isError: true,
  });

  const toolResultMessage: ToolResultMessage = {
    role: "toolResult",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    content: result.content,
    details: {},
    isError: true,
    timestamp: Date.now(),
  };

  stream.push({ type: "message_start", message: toolResultMessage });
  stream.push({ type: "message_end", message: toolResultMessage });

  return toolResultMessage;
}
