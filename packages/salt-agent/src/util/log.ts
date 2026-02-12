import path from "path"
import fs from "fs/promises"
import { createWriteStream, type WriteStream } from "fs"
import z from "zod"
import { Global } from "../global/global.js"

export namespace Log {
  export const Level = z.enum(["DEBUG", "INFO", "WARN", "ERROR"])
  export type Level = z.infer<typeof Level>

  const levelPriority: Record<Level, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  }

  let level: Level = "INFO"

  function shouldLog(input: Level): boolean {
    return levelPriority[input] >= levelPriority[level]
  }

  export type Logger = {
    debug(message?: any, extra?: Record<string, any>): void
    info(message?: any, extra?: Record<string, any>): void
    error(message?: any, extra?: Record<string, any>): void
    warn(message?: any, extra?: Record<string, any>): void
    tag(key: string, value: string): Logger
    clone(): Logger
    time(
      message: string,
      extra?: Record<string, any>,
    ): {
      stop(): void
      [Symbol.dispose](): void
    }
  }

  const loggers = new Map<string, Logger>()

  export const Default = create({ service: "default" })

  export interface Options {
    print: boolean
    dev?: boolean
    level?: Level
  }

  let logpath = ""
  export function file() {
    return logpath
  }

  let write = (msg: string) => {
    process.stderr.write(msg)
    return msg.length
  }

  let logStream: WriteStream | undefined

  export async function init(options: Options) {
    if (options.level) level = options.level
    await cleanup(Global.Path.log)
    if (options.print) return
    await fs.mkdir(Global.Path.log, { recursive: true })
    logpath = path.join(
      Global.Path.log,
      options.dev ? "dev.log" : new Date().toISOString().split(".")[0]!.replace(/:/g, "") + ".log",
    )
    // Truncate if exists
    await fs.truncate(logpath).catch(() => {})
    logStream = createWriteStream(logpath, { flags: "a" })
    write = (msg: string) => {
      logStream!.write(msg)
      return msg.length
    }
  }

  async function cleanup(dir: string) {
    try {
      const entries = await fs.readdir(dir)
      const logFiles = entries
        .filter((f) => /^\d{4}-\d{2}-\d{2}T\d{6}\.log$/.test(f))
        .sort()
      if (logFiles.length <= 5) return
      const filesToDelete = logFiles.slice(0, -10)
      await Promise.all(filesToDelete.map((f) => fs.unlink(path.join(dir, f)).catch(() => {})))
    } catch {
      // dir may not exist yet
    }
  }

  function formatError(error: Error, depth = 0): string {
    const result = error.message
    return error.cause instanceof Error && depth < 10
      ? result + " Caused by: " + formatError(error.cause, depth + 1)
      : result
  }

  let last = Date.now()

  export function create(tags?: Record<string, any>) {
    tags = tags || {}

    const service = tags["service"]
    if (service && typeof service === "string") {
      const cached = loggers.get(service)
      if (cached) return cached
    }

    function build(message: any, extra?: Record<string, any>) {
      const prefix = Object.entries({
        ...tags,
        ...extra,
      })
        .filter(([_, value]) => value !== undefined && value !== null)
        .map(([key, value]) => {
          const p = `${key}=`
          if (value instanceof Error) return p + formatError(value)
          if (typeof value === "object") return p + JSON.stringify(value)
          return p + value
        })
        .join(" ")
      const next = new Date()
      const diff = next.getTime() - last
      last = next.getTime()
      return [next.toISOString().split(".")[0], "+" + diff + "ms", prefix, message].filter(Boolean).join(" ") + "\n"
    }

    const result: Logger = {
      debug(message?: any, extra?: Record<string, any>) {
        if (shouldLog("DEBUG")) {
          write("DEBUG " + build(message, extra))
        }
      },
      info(message?: any, extra?: Record<string, any>) {
        if (shouldLog("INFO")) {
          write("INFO  " + build(message, extra))
        }
      },
      error(message?: any, extra?: Record<string, any>) {
        if (shouldLog("ERROR")) {
          write("ERROR " + build(message, extra))
        }
      },
      warn(message?: any, extra?: Record<string, any>) {
        if (shouldLog("WARN")) {
          write("WARN  " + build(message, extra))
        }
      },
      tag(key: string, value: string) {
        if (tags) tags[key] = value
        return result
      },
      clone() {
        const cloned = { ...tags }
        delete cloned["service"]
        return Log.create(cloned)
      },
      time(message: string, extra?: Record<string, any>) {
        const now = Date.now()
        result.info(message, { status: "started", ...extra })
        function stop() {
          result.info(message, {
            status: "completed",
            duration: Date.now() - now,
            ...extra,
          })
        }
        return {
          stop,
          [Symbol.dispose]() {
            stop()
          },
        }
      },
    }

    if (service && typeof service === "string") {
      loggers.set(service, result)
    }

    return result
  }
}
