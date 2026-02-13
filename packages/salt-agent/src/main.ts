/**
 * 启动入口 — 初始化并运行 Salt Agent HTTP 服务器。
 *
 * 用法:
 *   npx tsx src/main.ts [--port 4096] [--host localhost] [--dir .]
 */
import { mkdirSync } from "fs"
import { Server } from "./server/server.js"
import { Workspace } from "./workspace/workspace.js"
import { Global } from "./global/global.js"

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2)
  let port = 4096
  let hostname = "localhost"
  let dir = Global.Path.workplace

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const next = args[i + 1]
    if ((arg === "--port" || arg === "-p") && next) {
      port = parseInt(next, 10)
      i++
    } else if ((arg === "--host" || arg === "-h") && next) {
      hostname = next
      i++
    } else if ((arg === "--dir" || arg === "-d") && next) {
      dir = next
      i++
    } else if (arg === "--help") {
      console.log(`
Salt Agent Server

Usage:
  npx tsx src/main.ts [options]

Options:
  --port, -p <number>   Port to listen on (default: 4096)
  --host, -h <string>   Hostname to bind (default: localhost)
  --dir,  -d <string>   Working directory (default: ~/.salt-agent/workplace)
  --help                Show this help
`)
      process.exit(0)
    }
  }

  return { port, hostname, dir }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs()

  mkdirSync(opts.dir, { recursive: true })
  Workspace.setDirectory(opts.dir)

  const { url } = await Server.listen({
    port: opts.port,
    hostname: opts.hostname,
  })

  console.log(`Salt Agent server running at ${url}`)
  console.log(`Working directory: ${Workspace.directory}`)

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...")
    process.exit(0)
  })
  process.on("SIGTERM", () => {
    process.exit(0)
  })
}

main().catch((err) => {
  console.error("Failed to start:", err)
  process.exit(1)
})
