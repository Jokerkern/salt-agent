import { eq } from "drizzle-orm"
import { getDb, schema } from "../storage/db.js"

/**
 * Get all settings as a key-value map.
 */
export function getAllSettings(): Record<string, unknown> {
  const db = getDb()
  const rows = db.select().from(schema.settings).all()
  const result: Record<string, unknown> = {}
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value)
    } catch {
      result[row.key] = row.value
    }
  }
  return result
}

/**
 * Get a specific setting by key.
 */
export function getSetting(key: string): unknown | undefined {
  const db = getDb()
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get()
  if (!row) return undefined
  try {
    return JSON.parse(row.value)
  } catch {
    return row.value
  }
}

/**
 * Set one or more settings (upsert).
 */
export function setSettings(values: Record<string, unknown>): string[] {
  const db = getDb()
  const now = Date.now()
  const keys: string[] = []

  for (const [key, value] of Object.entries(values)) {
    const serialized = JSON.stringify(value)
    const existing = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get()

    if (existing) {
      db.update(schema.settings)
        .set({ value: serialized, updated_at: now })
        .where(eq(schema.settings.key, key))
        .run()
    } else {
      db.insert(schema.settings)
        .values({ key, value: serialized, updated_at: now })
        .run()
    }
    keys.push(key)
  }

  return keys
}
