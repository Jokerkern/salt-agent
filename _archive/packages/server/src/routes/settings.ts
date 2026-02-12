import { Hono } from "hono"
import { getAllSettings, getSetting, setSettings } from "@salt-agent/core"

export function createSettingsRoutes() {
  const app = new Hono()

  // Get all settings
  app.get("/", (c) => {
    return c.json(getAllSettings())
  })

  // Get a specific setting
  app.get("/:key", (c) => {
    const key = c.req.param("key")
    const value = getSetting(key)
    if (value === undefined) {
      return c.json({ error: "Setting not found" }, 404)
    }
    return c.json({ key, value })
  })

  // Set settings (upsert)
  app.post("/", async (c) => {
    const body = await c.req.json()

    if (typeof body !== "object" || body === null) {
      return c.json({ error: "Body must be an object of key-value pairs" }, 400)
    }

    const updated = setSettings(body as Record<string, unknown>)
    return c.json({ updated })
  })

  return app
}
