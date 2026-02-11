import { z } from "zod"

// ---------------------------------------------------------------------------
// Message content block types (stored as JSON in DB)
// ---------------------------------------------------------------------------

export const TextBlock = z.object({
  type: z.literal("text"),
  text: z.string(),
})

export const ToolCallBlock = z.object({
  type: z.literal("tool-call"),
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.unknown(),
})

export const ToolResultBlock = z.object({
  type: z.literal("tool-result"),
  toolCallId: z.string(),
  toolName: z.string(),
  result: z.unknown(),
  isError: z.boolean().optional(),
})

export const ContentBlock = z.discriminatedUnion("type", [
  TextBlock,
  ToolCallBlock,
  ToolResultBlock,
])

export type ContentBlock = z.infer<typeof ContentBlock>

// ---------------------------------------------------------------------------
// Message types for API responses
// ---------------------------------------------------------------------------

export interface MessageInfo {
  id: string
  sessionId: string
  role: "user" | "assistant" | "tool"
  content: ContentBlock[]
  tokensInput: number
  tokensOutput: number
  cost: number
  modelId?: string
  providerId?: string
  finishReason?: string
  createdAt: number
}
