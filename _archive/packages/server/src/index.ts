import "dotenv/config"
import { serve } from "@hono/node-server"
import { ensureDirs, getDataDir, getWorkplaceDir } from "@salt-agent/core"
import { createApp } from "./server.js"

async function main() {
  console.log("Starting salt-agent...")

  ensureDirs()
  console.log(`Data directory: ${getDataDir()}`)
  console.log(`Workplace directory: ${getWorkplaceDir()}`)

  const app = createApp()
  const port = parseInt(process.env["PORT"] ?? "9426", 10)

  serve({ fetch: app.fetch, port })
  console.log(`Server running on http://localhost:${port}`)
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
