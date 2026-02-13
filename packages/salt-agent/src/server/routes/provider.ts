import { Hono } from "hono"
import { Provider } from "../../provider/provider.js"
import { lazy } from "../../util/lazy.js"

export const ProviderRoutes = lazy(() =>
  new Hono()
    // -----------------------------------------------------------------------
    // List providers
    // -----------------------------------------------------------------------
    .get("/", async (c) => {
      const allProviders = await Provider.listAll()
      const connectedProviders = await Provider.list()
      const connected: string[] = Object.keys(connectedProviders)

      const defaultModels: Record<string, string> = {}
      for (const [id, provider] of Object.entries(connectedProviders)) {
        const models = Provider.sort(Object.values(provider.models))
        if (models.length > 0) {
          defaultModels[id] = models[0]!.id
        }
      }

      // Strip API keys from response
      const all = Object.values(allProviders).map(({ key: _key, ...rest }) => rest)

      return c.json({
        all,
        default: defaultModels,
        connected,
      })
    })

    // -----------------------------------------------------------------------
    // Get provider auth methods
    // -----------------------------------------------------------------------
    .get("/auth", async (c) => {
      const providers = await Provider.list()
      const methods: Record<string, Array<{ type: string; env?: string[] }>> = {}

      for (const [id, provider] of Object.entries(providers)) {
        const providerMethods: Array<{ type: string; env?: string[] }> = []
        if (provider.env.length > 0) {
          providerMethods.push({ type: "env", env: provider.env })
        }
        providerMethods.push({ type: "api_key" })
        methods[id] = providerMethods
      }

      return c.json(methods)
    }),
)
