import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { sql } from "drizzle-orm"
import { getDbPath, ensureDirs } from "../config/config.js"
import * as schema from "./schema.js"

let _db: ReturnType<typeof drizzle> | undefined

/**
 * Get or create the singleton database connection.
 * Runs migrations inline (create tables if not exist) on first call.
 */
export function getDb() {
  if (_db) return _db

  ensureDirs()
  const sqlite = new Database(getDbPath())
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")

  _db = drizzle(sqlite, { schema })

  // Inline migration — create tables if they don't exist
  migrate(_db)

  return _db
}

/**
 * Create all tables if they don't already exist.
 * This avoids requiring a separate drizzle-kit migration step for basic usage.
 */
function migrate(db: ReturnType<typeof drizzle>) {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      agent TEXT NOT NULL DEFAULT 'build',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tokens_input INTEGER DEFAULT 0,
      tokens_output INTEGER DEFAULT 0,
      cost REAL DEFAULT 0,
      model_id TEXT,
      provider_id TEXT,
      finish_reason TEXT,
      created_at INTEGER NOT NULL
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS part (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      text TEXT,
      tool_name TEXT,
      tool_call_id TEXT,
      tool_input TEXT,
      tool_output TEXT,
      tool_status TEXT,
      tool_error TEXT,
      reasoning TEXT,
      started_at INTEGER,
      ended_at INTEGER,
      created_at INTEGER NOT NULL
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS provider_config (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      name TEXT NOT NULL,
      api_key TEXT,
      base_url TEXT,
      model_id TEXT,
      options TEXT,
      is_default INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  // Indexes for common queries
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_message_session_id ON message(session_id)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_part_message_id ON part(message_id)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_part_session_id ON part(session_id)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_provider_config_provider_id ON provider_config(provider_id)`)
}

export { schema }
