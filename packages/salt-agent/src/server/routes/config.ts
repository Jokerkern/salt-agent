import { Hono } from "hono"
import { Config } from "../../config/config.js"
import { Provider } from "../../provider/provider.js"
import { lazy } from "../../util/lazy.js"

export const ConfigRoutes = lazy(() =>
  new Hono()
    // -----------------------------------------------------------------------
    // Get configuration
    // -----------------------------------------------------------------------
    .get("/", async (c) => {
      return c.json(await Config.get())
    })

    // -----------------------------------------------------------------------
    // Update configuration
    // -----------------------------------------------------------------------
    .patch("/", async (c) => {
      const body = await c.req.json<Config.Info>()
      const config = await Config.save(body)
      // Reset provider cache so new provider configs take effect
      Provider.reset()
      return c.json(config)
    })

    // -----------------------------------------------------------------------
    // List config providers (connected providers with default models)
    // -----------------------------------------------------------------------
    .get("/providers", async (c) => {
      const providers = await Provider.list()
      const defaultModels: Record<string, string> = {}
      for (const [id, provider] of Object.entries(providers)) {
        const models = Provider.sort(Object.values(provider.models))
        if (models.length > 0) {
          defaultModels[id] = models[0]!.id
        }
      }
      return c.json({
        providers: Object.values(providers),
        default: defaultModels,
      })
    }),
)
