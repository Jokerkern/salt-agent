import fs from "fs/promises"
import path from "path"
import { Global } from "../global/global.js"
import { Identifier } from "../id/id.js"

/**
 * Output truncation for tool results.
 * Limits output to MAX_LINES / MAX_BYTES, saves full output to disk.
 */
export namespace Truncate {
  export const MAX_LINES = 2000
  export const MAX_BYTES = 50 * 1024
  export const DIR = path.join(Global.Path.data, "tool-output")
  /** 工具输出目录的通配符模式（用于权限规则）。 */
  export const GLOB = path.join(Global.Path.data, "tool-output", "*")
  const RETENTION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

  export type Result =
    | { content: string; truncated: false }
    | { content: string; truncated: true; outputPath: string }

  export interface Options {
    maxLines?: number
    maxBytes?: number
    direction?: "head" | "tail"
  }

  export async function cleanup() {
    const cutoff = Date.now() - RETENTION_MS
    try {
      const entries = await fs.readdir(DIR)
      for (const entry of entries) {
        if (!entry.startsWith("tol_")) continue
        try {
          const ts = Identifier.timestamp(entry)
          if (ts >= cutoff) continue
        } catch {
          continue
        }
        await fs.unlink(path.join(DIR, entry)).catch(() => {})
      }
    } catch {
      // DIR may not exist yet
    }
  }

  export async function output(
    text: string,
    options: Options = {},
  ): Promise<Result> {
    const maxLines = options.maxLines ?? MAX_LINES
    const maxBytes = options.maxBytes ?? MAX_BYTES
    const direction = options.direction ?? "head"
    const lines = text.split("\n")
    const totalBytes = Buffer.byteLength(text, "utf-8")

    if (lines.length <= maxLines && totalBytes <= maxBytes) {
      return { content: text, truncated: false }
    }

    const out: string[] = []
    let bytes = 0
    let hitBytes = false

    if (direction === "head") {
      for (let i = 0; i < lines.length && i < maxLines; i++) {
        const size =
          Buffer.byteLength(lines[i]!, "utf-8") + (i > 0 ? 1 : 0)
        if (bytes + size > maxBytes) {
          hitBytes = true
          break
        }
        out.push(lines[i]!)
        bytes += size
      }
    } else {
      for (
        let i = lines.length - 1;
        i >= 0 && out.length < maxLines;
        i--
      ) {
        const size =
          Buffer.byteLength(lines[i]!, "utf-8") + (out.length > 0 ? 1 : 0)
        if (bytes + size > maxBytes) {
          hitBytes = true
          break
        }
        out.unshift(lines[i]!)
        bytes += size
      }
    }

    const removed = hitBytes
      ? totalBytes - bytes
      : lines.length - out.length
    const unit = hitBytes ? "字节" : "行"
    const preview = out.join("\n")

    const id = Identifier.ascending("tool")
    await fs.mkdir(DIR, { recursive: true })
    const filepath = path.join(DIR, id)
    await fs.writeFile(filepath, text, "utf-8")

    const hint = `工具调用成功，但输出已截断。完整输出已保存至：${filepath}\n使用 Grep 搜索完整内容，或使用 Read 的 offset/limit 查看指定部分。`
    const message =
      direction === "head"
        ? `${preview}\n\n...已截断 ${removed} ${unit}...\n\n${hint}`
        : `...已截断 ${removed} ${unit}...\n\n${hint}\n\n${preview}`

    return { content: message, truncated: true, outputPath: filepath }
  }
}
