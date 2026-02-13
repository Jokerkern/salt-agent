import { Hono } from "hono"
import { cors } from "hono/cors"
import { streamSSE } from "hono/streaming"
import { Bus } from "../bus/bus.js"
import { Log } from "../util/log.js"
import { NamedError } from "../util/error.js"
import { Storage } from "../storage/storage.js"
import { Provider } from "../provider/provider.js"
import { Agent } from "../agent/agent.js"
import { Auth } from "../provider/auth.js"
import { Workspace } from "../workspace/workspace.js"
import { Global } from "../global/global.js"
import { SessionRoutes } from "./routes/session.js"
import { ProviderRoutes } from "./routes/provider.js"
import { ConfigRoutes } from "./routes/config.js"
import { PermissionRoutes } from "./routes/permission.js"
import { QuestionRoutes } from "./routes/question.js"
import { lazy } from "../util/lazy.js"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import { existsSync, readFileSync } from "fs"
import { join, extname } from "path"
import { fileURLToPath } from "url"

// Suppress AI SDK warnings on stdout
// @ts-ignore
globalThis.AI_SDK_LOG_WARNINGS = false

export namespace Server {
  const log = Log.create({ service: "server" })

  let _url: URL | undefined
  let _corsWhitelist: string[] = []

  export function url(): URL {
    return _url ?? new URL("http://localhost:4096")
  }

  // ---------------------------------------------------------------------------
  // App
  // ---------------------------------------------------------------------------

  export const App: () => Hono = lazy(
    () =>
      new Hono()

        // ---------------------------------------------------------------
        // Error handler
        // ---------------------------------------------------------------
        .onError((err, c) => {
          log.error("failed", { error: err })
          if (err instanceof NamedError) {
            let status: ContentfulStatusCode
            if (err instanceof Storage.NotFoundError) status = 404
            else if (err instanceof Provider.ModelNotFoundError) status = 400
            else status = 500
            return c.json(err.toObject(), { status })
          }
          const message = err instanceof Error && err.stack ? err.stack : err.toString()
          return c.json(new NamedError.Unknown({ message }).toObject(), {
            status: 500,
          })
        })

        // ---------------------------------------------------------------
        // Request logging
        // ---------------------------------------------------------------
        .use(async (c, next) => {
          log.info("request", {
            method: c.req.method,
            path: c.req.path,
          })
          await next()
        })

        // ---------------------------------------------------------------
        // CORS
        // ---------------------------------------------------------------
        .use(
          cors({
            origin(input) {
              if (!input) return ""

              // Allow localhost
              if (input.startsWith("http://localhost:")) return input
              if (input.startsWith("http://127.0.0.1:")) return input

              // Allow tauri
              if (
                input === "tauri://localhost" ||
                input === "http://tauri.localhost" ||
                input === "https://tauri.localhost"
              )
                return input

              // Whitelist
              if (_corsWhitelist.includes(input)) return input

              return ""
            },
          }),
        )

        // ---------------------------------------------------------------
        // Auth routes (before workspace context)
        // ---------------------------------------------------------------
        .put("/auth/:providerID", async (c) => {
          const providerID = c.req.param("providerID")
          const info = await c.req.json<Auth.Info>()
          await Auth.set(providerID, info)
          Provider.reset()
          return c.json(true)
        })
        .delete("/auth/:providerID", async (c) => {
          const providerID = c.req.param("providerID")
          await Auth.remove(providerID)
          Provider.reset()
          return c.json(true)
        })

        // ---------------------------------------------------------------
        // Mount routes
        // ---------------------------------------------------------------
        .route("/session", SessionRoutes())
        .route("/provider", ProviderRoutes())
        .route("/config", ConfigRoutes())
        .route("/permission", PermissionRoutes())
        .route("/question", QuestionRoutes())

        // ---------------------------------------------------------------
        // Path info
        // ---------------------------------------------------------------
        .get("/path", async (c) => {
          return c.json({
            data: Global.Path.data,
            config: Global.Path.config,
            storage: Global.Path.storage,
            directory: Workspace.directory,
            worktree: Workspace.worktree,
          })
        })

        // ---------------------------------------------------------------
        // Agent list
        // ---------------------------------------------------------------
        .get("/agent", async (c) => {
          const agents = await Agent.list()
          return c.json(agents)
        })

        // ---------------------------------------------------------------
        // Health check
        // ---------------------------------------------------------------
        .get("/health", async (c) => {
          return c.json({ status: "ok" })
        })

        // ---------------------------------------------------------------
        // SSE event stream
        // ---------------------------------------------------------------
        .get("/event", async (c) => {
          log.info("event connected")
          return streamSSE(c, async (stream) => {
            stream.writeSSE({
              data: JSON.stringify({
                type: "server.connected",
                properties: {},
              }),
            })

            const unsub = Bus.subscribeAll(async (event) => {
              await stream.writeSSE({
                data: JSON.stringify(event),
              })
            })

            // Send heartbeat every 30s to prevent timeout
            const heartbeat = setInterval(() => {
              stream.writeSSE({
                data: JSON.stringify({
                  type: "server.heartbeat",
                  properties: {},
                }),
              })
            }, 30000)

            await new Promise<void>((resolve) => {
              stream.onAbort(() => {
                clearInterval(heartbeat)
                unsub()
                resolve()
                log.info("event disconnected")
              })
            })
          })
        }) as unknown as Hono,
  )

  // ---------------------------------------------------------------------------
  // listen() — start the HTTP server
  // ---------------------------------------------------------------------------

  export interface ListenOptions {
    port: number
    hostname: string
    cors?: string[]
    /** Directory containing built web UI assets (index.html, assets/). Falls back to ../web/dist relative to this package. */
    webDir?: string
  }

  // ---------------------------------------------------------------------------
  // Static file helpers
  // ---------------------------------------------------------------------------

  const MIME_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".map": "application/json",
  }

  function resolveWebDir(explicit?: string): string | undefined {
    if (explicit) {
      return existsSync(join(explicit, "index.html")) ? explicit : undefined
    }
    // Auto-detect: try ../web/dist relative to this file
    const thisDir = typeof __dirname !== "undefined"
      ? __dirname
      : fileURLToPath(new URL(".", import.meta.url))
    const candidate = join(thisDir, "..", "..", "..", "web", "dist")
    return existsSync(join(candidate, "index.html")) ? candidate : undefined
  }

  export async function listen(opts: ListenOptions) {
    _corsWhitelist = opts.cors ?? []
    const webDir = resolveWebDir(opts.webDir)
    if (webDir) {
      log.info("serving web UI", { dir: webDir })
    }

    const { createServer } = await import("http")

    const server = createServer(async (req, res) => {
      const reqPath = (req.url ?? "/").split("?")[0]!

      // ---------------------------------------------------------------
      // Static file serving (Web UI)
      // ---------------------------------------------------------------
      if (webDir && req.method === "GET") {
        // Known API paths that should NOT be served as static files
        const isApiPath =
          reqPath.startsWith("/session") ||
          reqPath.startsWith("/provider") ||
          reqPath.startsWith("/config") ||
          reqPath.startsWith("/permission") ||
          reqPath.startsWith("/question") ||
          reqPath.startsWith("/auth/") ||
          reqPath.startsWith("/event") ||
          reqPath.startsWith("/agent") ||
          reqPath.startsWith("/health") ||
          reqPath.startsWith("/path")

        if (!isApiPath) {
          // Try exact file first, then fall back to index.html (SPA routing)
          const filePath = join(webDir, reqPath === "/" ? "index.html" : reqPath)
          if (existsSync(filePath)) {
            const mime = MIME_TYPES[extname(filePath)] ?? "application/octet-stream"
            const content = readFileSync(filePath)
            const cacheControl = filePath.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache"
            res.writeHead(200, {
              "Content-Type": mime,
              "Content-Length": content.length.toString(),
              "Cache-Control": cacheControl,
            })
            res.end(content)
            return
          }
          // SPA fallback: serve index.html for unknown paths
          const indexPath = join(webDir, "index.html")
          if (existsSync(indexPath)) {
            const content = readFileSync(indexPath)
            res.writeHead(200, {
              "Content-Type": "text/html; charset=utf-8",
              "Content-Length": content.length.toString(),
              "Cache-Control": "no-cache",
            })
            res.end(content)
            return
          }
        }
      }

      // ---------------------------------------------------------------
      // API routes (Hono)
      // ---------------------------------------------------------------
      const url = `http://${opts.hostname}:${opts.port}${req.url ?? "/"}`

      // Collect body
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(chunk as Buffer)
      }
      const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined

      // Build a standard Request
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) {
          if (Array.isArray(value)) {
            for (const v of value) headers.append(key, v)
          } else {
            headers.set(key, value)
          }
        }
      }

      const request = new Request(url, {
        method: req.method,
        headers,
        body: body && req.method !== "GET" && req.method !== "HEAD" ? body : undefined,
        // @ts-ignore duplex needed for node
        duplex: "half",
      })

      try {
        const response = await App().fetch(request)

        // Write status and headers
        const responseHeaders: Record<string, string | string[]> = {}
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value
        })
        res.writeHead(response.status, responseHeaders)

        // Stream body
        if (response.body) {
          const reader = response.body.getReader()
          const push = async () => {
            while (true) {
              const { done, value } = await reader.read()
              if (done) {
                res.end()
                break
              }
              if (!res.write(value)) {
                await new Promise<void>((resolve) => res.once("drain", resolve))
              }
            }
          }
          push().catch(() => res.end())
        } else {
          res.end()
        }
      } catch (e) {
        log.error("request handler error", { error: e })
        if (!res.headersSent) {
          res.writeHead(500)
          res.end("Internal Server Error")
        }
      }
    })

    return new Promise<{ url: URL; server: ReturnType<typeof createServer>; stop: () => void }>((resolve, reject) => {
      server.on("error", reject)
      server.listen(opts.port, opts.hostname, () => {
        const addr = server.address()
        const port = typeof addr === "object" && addr ? addr.port : opts.port
        _url = new URL(`http://${opts.hostname}:${port}`)
        log.info("server started", { url: _url.toString() })
        resolve({
          url: _url,
          server,
          stop: () => {
            server.close()
          },
        })
      })
    })
  }
}
