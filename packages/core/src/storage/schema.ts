import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core"

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  agent: text("agent").notNull().default("build"),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
})

// ---------------------------------------------------------------------------
// Message — stores each conversation turn
// ---------------------------------------------------------------------------

export const message = sqliteTable("message", {
  id: text("id").primaryKey(),
  session_id: text("session_id")
    .notNull()
    .references(() => session.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" | "assistant" | "tool"
  content: text("content").notNull(), // JSON-serialized content blocks
  tokens_input: integer("tokens_input").default(0),
  tokens_output: integer("tokens_output").default(0),
  cost: real("cost").default(0),
  model_id: text("model_id"),
  provider_id: text("provider_id"),
  finish_reason: text("finish_reason"),
  created_at: integer("created_at").notNull(),
})

// ---------------------------------------------------------------------------
// Part — granular parts within an assistant message (text, tool, reasoning)
// ---------------------------------------------------------------------------

export const part = sqliteTable("part", {
  id: text("id").primaryKey(),
  message_id: text("message_id")
    .notNull()
    .references(() => message.id, { onDelete: "cascade" }),
  session_id: text("session_id")
    .notNull()
    .references(() => session.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "text" | "tool" | "reasoning" | "step-start" | "step-finish"
  // For text parts
  text: text("text"),
  // For tool parts
  tool_name: text("tool_name"),
  tool_call_id: text("tool_call_id"),
  tool_input: text("tool_input"), // JSON
  tool_output: text("tool_output"), // JSON
  tool_status: text("tool_status"), // "pending" | "running" | "completed" | "error"
  tool_error: text("tool_error"),
  // For reasoning parts
  reasoning: text("reasoning"),
  // Timing
  started_at: integer("started_at"),
  ended_at: integer("ended_at"),
  created_at: integer("created_at").notNull(),
})

// ---------------------------------------------------------------------------
// Provider Config — stores API keys, base URLs, model preferences
// ---------------------------------------------------------------------------

export const provider_config = sqliteTable("provider_config", {
  id: text("id").primaryKey(),
  provider_id: text("provider_id").notNull(),
  name: text("name").notNull(),
  api_key: text("api_key"),
  base_url: text("base_url"),
  model_id: text("model_id"),
  options: text("options"), // JSON
  is_default: integer("is_default").default(0),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
})

// ---------------------------------------------------------------------------
// Settings — global key-value settings store
// ---------------------------------------------------------------------------

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON
  updated_at: integer("updated_at").notNull(),
})
