import { eq, desc } from "drizzle-orm"
import { nanoid } from "nanoid"
import { getDb, schema } from "../storage/db.js"
import type { ContentBlock, MessageInfo } from "./message.js"

// ---------------------------------------------------------------------------
// Session info type (returned by API)
// ---------------------------------------------------------------------------

export interface SessionInfo {
  id: string
  title: string
  agent: string
  createdAt: number
  updatedAt: number
}

// ---------------------------------------------------------------------------
// Session CRUD
// ---------------------------------------------------------------------------

export function createSession(input?: {
  title?: string
  agent?: string
}): SessionInfo {
  const db = getDb()
  const now = Date.now()
  const id = nanoid()

  db.insert(schema.session)
    .values({
      id,
      title: input?.title ?? `New session - ${new Date().toISOString()}`,
      agent: input?.agent ?? "build",
      created_at: now,
      updated_at: now,
    })
    .run()

  return {
    id,
    title: input?.title ?? `New session - ${new Date().toISOString()}`,
    agent: input?.agent ?? "build",
    createdAt: now,
    updatedAt: now,
  }
}

export function getSession(id: string): SessionInfo | undefined {
  const db = getDb()
  const row = db.select().from(schema.session).where(eq(schema.session.id, id)).get()
  if (!row) return undefined
  return {
    id: row.id,
    title: row.title,
    agent: row.agent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listSessions(): SessionInfo[] {
  const db = getDb()
  const rows = db
    .select()
    .from(schema.session)
    .orderBy(desc(schema.session.updated_at))
    .all()

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    agent: row.agent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export function updateSession(
  id: string,
  input: Partial<{ title: string; agent: string }>,
): SessionInfo | undefined {
  const db = getDb()
  const now = Date.now()

  const existing = db.select().from(schema.session).where(eq(schema.session.id, id)).get()
  if (!existing) return undefined

  db.update(schema.session)
    .set({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.agent !== undefined && { agent: input.agent }),
      updated_at: now,
    })
    .where(eq(schema.session.id, id))
    .run()

  return getSession(id)
}

export function deleteSession(id: string): boolean {
  const db = getDb()
  const result = db.delete(schema.session).where(eq(schema.session.id, id)).run()
  return result.changes > 0
}

export function sessionExists(id: string): boolean {
  return getSession(id) !== undefined
}

// ---------------------------------------------------------------------------
// Message CRUD
// ---------------------------------------------------------------------------

export function addMessage(input: {
  sessionId: string
  role: "user" | "assistant" | "tool"
  content: ContentBlock[]
  tokensInput?: number
  tokensOutput?: number
  cost?: number
  modelId?: string
  providerId?: string
  finishReason?: string
}): MessageInfo {
  const db = getDb()
  const now = Date.now()
  const id = nanoid()

  db.insert(schema.message)
    .values({
      id,
      session_id: input.sessionId,
      role: input.role,
      content: JSON.stringify(input.content),
      tokens_input: input.tokensInput ?? 0,
      tokens_output: input.tokensOutput ?? 0,
      cost: input.cost ?? 0,
      model_id: input.modelId ?? null,
      provider_id: input.providerId ?? null,
      finish_reason: input.finishReason ?? null,
      created_at: now,
    })
    .run()

  // Touch session updated_at
  db.update(schema.session)
    .set({ updated_at: now })
    .where(eq(schema.session.id, input.sessionId))
    .run()

  return {
    id,
    sessionId: input.sessionId,
    role: input.role,
    content: input.content,
    tokensInput: input.tokensInput ?? 0,
    tokensOutput: input.tokensOutput ?? 0,
    cost: input.cost ?? 0,
    modelId: input.modelId,
    providerId: input.providerId,
    finishReason: input.finishReason,
    createdAt: now,
  }
}

export function getMessages(sessionId: string): MessageInfo[] {
  const db = getDb()
  const rows = db
    .select()
    .from(schema.message)
    .where(eq(schema.message.session_id, sessionId))
    .orderBy(schema.message.created_at)
    .all()

  return rows.map(rowToMessage)
}

/**
 * Build CoreMessage[] for the Vercel AI SDK from stored messages.
 * Converts our message format into the format expected by streamText().
 */
export function buildCoreMessages(sessionId: string): import("ai").CoreMessage[] {
  const messages = getMessages(sessionId)
  const result: import("ai").CoreMessage[] = []

  for (const msg of messages) {
    if (msg.role === "user") {
      // Extract text from content blocks
      const text = msg.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n")
      result.push({ role: "user", content: text })
    } else if (msg.role === "assistant") {
      // Build assistant message with text + tool calls
      const parts: Array<{ type: "text"; text: string } | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }> = []
      for (const block of msg.content) {
        if (block.type === "text") {
          parts.push({ type: "text", text: block.text })
        } else if (block.type === "tool-call") {
          parts.push({
            type: "tool-call",
            toolCallId: block.toolCallId,
            toolName: block.toolName,
            input: block.args,
          })
        }
      }
      result.push({ role: "assistant", content: parts as import("ai").AssistantContent })
    } else if (msg.role === "tool") {
      // Tool results
      for (const block of msg.content) {
        if (block.type === "tool-result") {
          result.push({
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: block.toolCallId,
                toolName: block.toolName,
                output: block.result,
                isError: block.isError,
              } as import("ai").ToolResultPart,
            ],
          })
        }
      }
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToMessage(row: typeof schema.message.$inferSelect): MessageInfo {
  let content: ContentBlock[] = []
  try {
    content = JSON.parse(row.content) as ContentBlock[]
  } catch {
    content = [{ type: "text", text: row.content }]
  }

  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as "user" | "assistant" | "tool",
    content,
    tokensInput: row.tokens_input ?? 0,
    tokensOutput: row.tokens_output ?? 0,
    cost: row.cost ?? 0,
    modelId: row.model_id ?? undefined,
    providerId: row.provider_id ?? undefined,
    finishReason: row.finish_reason ?? undefined,
    createdAt: row.created_at,
  }
}
