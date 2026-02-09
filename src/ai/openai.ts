import OpenAI from "openai";
import type {
  ChatCompletionChunk,
  ChatCompletionContentPart,
  ChatCompletionContentPartImage,
  ChatCompletionContentPartText,
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions.js";
import { AssistantMessageEventStream } from "./event-stream.js";
import type {
  AssistantMessage,
  Context,
  Model,
  SimpleStreamOptions,
  StopReason,
  StreamOptions,
  TextContent,
  ThinkingContent,
  Tool,
  ToolCall,
  ToolResultMessage,
} from "./types.js";
import { parseStreamingJson, sanitizeSurrogates } from "./utils.js";

export interface OpenAIOptions extends StreamOptions {
  toolChoice?: "auto" | "none" | "required";
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
}

export function streamOpenAI(
  model: Model,
  context: Context,
  options?: OpenAIOptions,
): AssistantMessageEventStream {
  const stream = new AssistantMessageEventStream();

  (async () => {
    const output: AssistantMessage = {
      role: "assistant",
      content: [],
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
      stopReason: "stop",
      timestamp: Date.now(),
    };

    try {
      const apiKey = options?.apiKey || process.env.OPENAI_API_KEY || "";
      if (!apiKey) {
        throw new Error("需要 OpenAI API Key");
      }

      const client = new OpenAI({
        apiKey,
        baseURL: model.baseUrl,
        dangerouslyAllowBrowser: true,
      });

      const params = buildParams(model, context, options);
      const openaiStream = await client.chat.completions.create(params, { signal: options?.signal });
      stream.push({ type: "start", partial: output });

      let currentBlock: TextContent | ThinkingContent | (ToolCall & { partialArgs?: string }) | null = null;
      const blocks = output.content;
      const blockIndex = () => blocks.length - 1;
      const finishCurrentBlock = (block?: typeof currentBlock) => {
        if (block) {
          if (block.type === "text") {
            stream.push({
              type: "text_end",
              contentIndex: blockIndex(),
              content: block.text,
              partial: output,
            });
          } else if (block.type === "thinking") {
            stream.push({
              type: "thinking_end",
              contentIndex: blockIndex(),
              content: block.thinking,
              partial: output,
            });
          } else if (block.type === "toolCall") {
            block.arguments = JSON.parse(block.partialArgs || "{}");
            delete block.partialArgs;
            stream.push({
              type: "toolcall_end",
              contentIndex: blockIndex(),
              toolCall: block,
              partial: output,
            });
          }
        }
      };

      for await (const chunk of openaiStream) {
        if (chunk.usage) {
          const cachedTokens = chunk.usage.prompt_tokens_details?.cached_tokens || 0;
          const reasoningTokens = chunk.usage.completion_tokens_details?.reasoning_tokens || 0;
          const input = (chunk.usage.prompt_tokens || 0) - cachedTokens;
          const outputTokens = (chunk.usage.completion_tokens || 0) + reasoningTokens;
          output.usage = {
            input,
            output: outputTokens,
            cacheRead: cachedTokens,
            cacheWrite: 0,
            totalTokens: input + outputTokens + cachedTokens,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          };
        }

        const choice = chunk.choices[0];
        if (!choice) continue;

        if (choice.finish_reason) {
          output.stopReason = mapStopReason(choice.finish_reason);
        }

        if (choice.delta) {
          // Handle text content
          if (choice.delta.content !== null && choice.delta.content !== undefined && choice.delta.content.length > 0) {
            if (!currentBlock || currentBlock.type !== "text") {
              finishCurrentBlock(currentBlock);
              currentBlock = { type: "text", text: "" };
              output.content.push(currentBlock);
              stream.push({ type: "text_start", contentIndex: blockIndex(), partial: output });
            }

            if (currentBlock.type === "text") {
              currentBlock.text += choice.delta.content;
              stream.push({
                type: "text_delta",
                contentIndex: blockIndex(),
                delta: choice.delta.content,
                partial: output,
              });
            }
          }

          // Handle reasoning/thinking
          const reasoningFields = ["reasoning_content", "reasoning"];
          let foundReasoningField: string | null = null;
          for (const field of reasoningFields) {
            if ((choice.delta as any)[field] !== null && (choice.delta as any)[field] !== undefined && (choice.delta as any)[field].length > 0) {
              if (!foundReasoningField) {
                foundReasoningField = field;
                break;
              }
            }
          }

          if (foundReasoningField) {
            if (!currentBlock || currentBlock.type !== "thinking") {
              finishCurrentBlock(currentBlock);
              currentBlock = { type: "thinking", thinking: "" };
              output.content.push(currentBlock);
              stream.push({ type: "thinking_start", contentIndex: blockIndex(), partial: output });
            }

            if (currentBlock.type === "thinking") {
              const delta = (choice.delta as any)[foundReasoningField];
              currentBlock.thinking += delta;
              stream.push({
                type: "thinking_delta",
                contentIndex: blockIndex(),
                delta,
                partial: output,
              });
            }
          }

          // Handle tool calls
          if (choice?.delta?.tool_calls) {
            for (const toolCall of choice.delta.tool_calls) {
              if (!currentBlock || currentBlock.type !== "toolCall" || (toolCall.id && currentBlock.id !== toolCall.id)) {
                finishCurrentBlock(currentBlock);
                currentBlock = {
                  type: "toolCall",
                  id: toolCall.id || "",
                  name: toolCall.function?.name || "",
                  arguments: {},
                  partialArgs: "",
                };
                output.content.push(currentBlock);
                stream.push({ type: "toolcall_start", contentIndex: blockIndex(), partial: output });
              }

              if (currentBlock.type === "toolCall") {
                if (toolCall.id) currentBlock.id = toolCall.id;
                if (toolCall.function?.name) currentBlock.name = toolCall.function.name;
                let delta = "";
                if (toolCall.function?.arguments) {
                  delta = toolCall.function.arguments;
                  currentBlock.partialArgs += toolCall.function.arguments;
                  currentBlock.arguments = parseStreamingJson(currentBlock.partialArgs);
                }
                stream.push({
                  type: "toolcall_delta",
                  contentIndex: blockIndex(),
                  delta,
                  partial: output,
                });
              }
            }
          }
        }
      }

      finishCurrentBlock(currentBlock);

      if (options?.signal?.aborted) {
        throw new Error("请求已中断");
      }

      if (output.stopReason === "aborted" || output.stopReason === "error") {
        throw new Error("发生未知错误");
      }

      stream.push({ type: "done", reason: output.stopReason, message: output });
      stream.end();
    } catch (error) {
      output.stopReason = options?.signal?.aborted ? "aborted" : "error";
      output.errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      stream.push({ type: "error", reason: output.stopReason, error: output });
      stream.end();
    }
  })();

  return stream;
}

export function streamSimpleOpenAI(
  model: Model,
  context: Context,
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  return streamOpenAI(model, context, {
    ...options,
    reasoningEffort: options?.reasoning as any,
  });
}

function buildParams(model: Model, context: Context, options?: OpenAIOptions) {
  const messages = convertMessages(model, context);

  const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
    model: model.id,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  };

  if (options?.maxTokens) {
    params.max_completion_tokens = options.maxTokens;
  }

  if (options?.temperature !== undefined) {
    params.temperature = options.temperature;
  }

  if (context.tools) {
    params.tools = convertTools(context.tools);
  }

  if (options?.toolChoice) {
    params.tool_choice = options.toolChoice;
  }

  if (options?.reasoningEffort && model.reasoning) {
    params.reasoning_effort = options.reasoningEffort as any;
  }

  return params;
}

function convertMessages(model: Model, context: Context): ChatCompletionMessageParam[] {
  const params: ChatCompletionMessageParam[] = [];

  if (context.systemPrompt) {
    params.push({ role: "system", content: sanitizeSurrogates(context.systemPrompt) });
  }

  for (const msg of context.messages) {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        params.push({
          role: "user",
          content: sanitizeSurrogates(msg.content),
        });
      } else {
        const content: ChatCompletionContentPart[] = msg.content.map((item): ChatCompletionContentPart => {
          if (item.type === "text") {
            return {
              type: "text",
              text: sanitizeSurrogates(item.text),
            } satisfies ChatCompletionContentPartText;
          } else {
            return {
              type: "image_url",
              image_url: {
                url: `data:${item.mimeType};base64,${item.data}`,
              },
            } satisfies ChatCompletionContentPartImage;
          }
        });
        const filteredContent = !model.input.includes("image")
          ? content.filter((c) => c.type !== "image_url")
          : content;
        if (filteredContent.length === 0) continue;
        params.push({
          role: "user",
          content: filteredContent,
        });
      }
    } else if (msg.role === "assistant") {
      const assistantMsg: any = {
        role: "assistant",
        content: null,
      };

      const textBlocks = msg.content.filter((b) => b.type === "text") as TextContent[];
      const nonEmptyTextBlocks = textBlocks.filter((b) => b.text && b.text.trim().length > 0);
      if (nonEmptyTextBlocks.length > 0) {
        assistantMsg.content = nonEmptyTextBlocks.map((b) => {
          return { type: "text", text: sanitizeSurrogates(b.text) };
        });
      }

      const toolCalls = msg.content.filter((b) => b.type === "toolCall") as ToolCall[];
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        }));
      }

      const hasContent = assistantMsg.content !== null && assistantMsg.content.length > 0;
      if (!hasContent && !assistantMsg.tool_calls) {
        continue;
      }
      params.push(assistantMsg);
    } else if (msg.role === "toolResult") {
      const toolMsg = msg as ToolResultMessage;
      const textResult = toolMsg.content
        .filter((c) => c.type === "text")
        .map((c) => (c as any).text)
        .join("\n");

      const toolResultMsg: ChatCompletionToolMessageParam = {
        role: "tool",
        content: sanitizeSurrogates(textResult || "(no text result)"),
        tool_call_id: toolMsg.toolCallId,
      };
      params.push(toolResultMsg);
    }
  }

  return params;
}

function convertTools(tools: Tool[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as any,
      strict: false,
    },
  }));
}

function mapStopReason(reason: ChatCompletionChunk.Choice["finish_reason"]): StopReason {
  if (reason === null) return "stop";
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "function_call":
    case "tool_calls":
      return "toolUse";
    case "content_filter":
      return "error";
    default:
      return "stop";
  }
}
