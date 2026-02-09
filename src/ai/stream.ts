import { streamOpenAI, streamSimpleOpenAI } from "./openai.js";
import type { AssistantMessage, AssistantMessageEventStream, Context, Model, SimpleStreamOptions, StreamOptions } from "./types.js";

export function stream(model: Model, context: Context, options?: StreamOptions): AssistantMessageEventStream {
  return streamOpenAI(model, context, options);
}

export async function complete(model: Model, context: Context, options?: StreamOptions): Promise<AssistantMessage> {
  const s = stream(model, context, options);
  return s.result();
}

export function streamSimple(model: Model, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream {
  return streamSimpleOpenAI(model, context, options);
}

export async function completeSimple(model: Model, context: Context, options?: SimpleStreamOptions): Promise<AssistantMessage> {
  const s = streamSimple(model, context, options);
  return s.result();
}
