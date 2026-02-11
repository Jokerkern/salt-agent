import { Hono } from "hono"
import {
  listProviders,
  listProviderConfigs,
  getProviderConfig,
  createProviderConfig,
  updateProviderConfig,
  deleteProviderConfig,
} from "@salt-agent/core"

export function createProvidersRoutes() {
  const app = new Hono()

  // List built-in provider definitions
  app.get("/available", (c) => {
    const providers = listProviders().map((p: { id: string; name: string; description: string; envKey?: string }) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      envKey: p.envKey,
    }))
    return c.json({ providers })
  })

  // List configured provider instances
  app.get("/", (c) => {
    const configs = listProviderConfigs().map(maskApiKey)
    return c.json({ providers: configs })
  })

  // Get a specific provider config
  app.get("/:id", (c) => {
    const id = c.req.param("id")
    const config = getProviderConfig(id)
    if (!config) {
      return c.json({ error: "Provider config not found" }, 404)
    }
    return c.json(maskApiKey(config))
  })

  // Create a new provider config
  app.post("/", async (c) => {
    const body = await c.req.json()
    const { providerId, name, apiKey, baseUrl, modelId, options, isDefault } = body

    if (!providerId || !name) {
      return c.json({ error: "providerId and name are required" }, 400)
    }

    const config = createProviderConfig({
      providerId,
      name,
      apiKey,
      baseUrl,
      modelId,
      options,
      isDefault,
    })

    return c.json(maskApiKey(config), 201)
  })

  // Update a provider config
  app.put("/:id", async (c) => {
    const id = c.req.param("id")
    const body = await c.req.json()

    const config = updateProviderConfig(id, body)
    if (!config) {
      return c.json({ error: "Provider config not found" }, 404)
    }

    return c.json(maskApiKey(config))
  })

  // Delete a provider config
  app.delete("/:id", (c) => {
    const id = c.req.param("id")
    const deleted = deleteProviderConfig(id)
    if (!deleted) {
      return c.json({ error: "Provider config not found" }, 404)
    }
    return c.json({ deleted: true })
  })

  return app
}

// Mask API key for responses
function maskApiKey<T extends { apiKey?: string }>(config: T): T {
  if (config.apiKey) {
    const key = config.apiKey
    return {
      ...config,
      apiKey: key.length > 8 ? key.slice(0, 4) + "****" + key.slice(-4) : "****",
    }
  }
  return config
}
