import z from "zod"
import fs from "fs"
import fsp from "fs/promises"
import path from "path"
import { Tool } from "./tool.js"
import { Workspace } from "../workspace/workspace.js"
import { Identifier } from "../id/id.js"
import { assertExternalDirectory } from "./external-directory.js"

const DEFAULT_READ_LIMIT = 2000
const MAX_LINE_LENGTH = 2000
const MAX_BYTES = 50 * 1024

const DESCRIPTION = `从本地文件系统读取文件。可通过此工具直接访问任意文件。

用法：
- 可指定行偏移量和行数限制（尤其适用于长文件）
- 输出中的行号从 1 开始
- 若路径为目录，则列出目录内容
- 支持图片和 PDF 作为附件
- 会自动检测并拒绝二进制文件`

export const ReadTool = Tool.define("read", {
  description: DESCRIPTION,
  parameters: z.object({
    filePath: z
      .string()
      .describe("要读取的文件或目录的绝对路径"),
    offset: z.coerce
      .number()
      .describe("开始读取的行号（从 1 开始）")
      .optional(),
    limit: z.coerce
      .number()
      .describe("最大读取行数（默认 2000）")
      .optional(),
  }),
  async execute(params, ctx) {
    if (params.offset !== undefined && params.offset < 1) {
      throw new Error("offset 必须大于或等于 1")
    }
    let filepath = params.filePath
    if (!path.isAbsolute(filepath)) {
      filepath = path.resolve(Workspace.directory, filepath)
    }
    const title = path.relative(Workspace.worktree, filepath)

    let stat: fs.Stats | undefined
    try {
      stat = await fsp.stat(filepath)
    } catch {}

    await assertExternalDirectory(ctx, filepath, {
      bypass: Boolean(ctx.extra?.["bypassCwdCheck"]),
      kind: stat?.isDirectory() ? "directory" : "file",
    })

    await ctx.ask({
      permission: "read",
      patterns: [filepath],
      always: ["*"],
      metadata: {},
    })

    if (!stat) {
      const dir = path.dirname(filepath)
      const base = path.basename(filepath)
      let suggestions: string[] = []
      try {
        const dirEntries = fs.readdirSync(dir)
        suggestions = dirEntries
          .filter(
            (entry) =>
              entry.toLowerCase().includes(base.toLowerCase()) ||
              base.toLowerCase().includes(entry.toLowerCase()),
          )
          .map((entry) => path.join(dir, entry))
          .slice(0, 3)
      } catch {}

      if (suggestions.length > 0) {
        throw new Error(
          `文件未找到：${filepath}\n\n您是否指以下之一？\n${suggestions.join("\n")}`,
        )
      }
      throw new Error(`文件未找到：${filepath}`)
    }

    if (stat.isDirectory()) {
      const dirents = await fsp.readdir(filepath, { withFileTypes: true })
      const entries = await Promise.all(
        dirents.map(async (dirent) => {
          if (dirent.isDirectory()) return dirent.name + "/"
          if (dirent.isSymbolicLink()) {
            const target = await fsp
              .stat(path.join(filepath, dirent.name))
              .catch(() => undefined)
            if (target?.isDirectory()) return dirent.name + "/"
          }
          return dirent.name
        }),
      )
      entries.sort((a, b) => a.localeCompare(b))

      const limit = params.limit ?? DEFAULT_READ_LIMIT
      const offset = params.offset ?? 1
      const start = offset - 1
      const sliced = entries.slice(start, start + limit)
      const truncated = start + sliced.length < entries.length

      const output = [
        `<path>${filepath}</path>`,
        `<type>directory</type>`,
        `<entries>`,
        sliced.join("\n"),
        truncated
          ? `\n(显示 ${sliced.length}/${entries.length} 项。使用 'offset' 参数可读取第 ${offset + sliced.length} 项之后的内容)`
          : `\n(共 ${entries.length} 项)`,
        `</entries>`,
      ].join("\n")

      return {
        title,
        output,
        metadata: {
          preview: sliced.slice(0, 20).join("\n"),
          truncated,
          loaded: [] as string[],
        },
      }
    }

    // Detect MIME type by extension
    const ext = path.extname(filepath).toLowerCase()
    const isImage = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"].includes(ext)
    const isPdf = ext === ".pdf"

    if (isImage || isPdf) {
      const data = await fsp.readFile(filepath)
      const mime = isImage
        ? `image/${ext === ".jpg" ? "jpeg" : ext.slice(1)}`
        : "application/pdf"
      const msg = `${isImage ? "图片" : "PDF"} 读取成功`
      return {
        title,
        output: msg,
        metadata: {
          preview: msg,
          truncated: false,
          loaded: [] as string[],
        },
        attachments: [
          {
            id: Identifier.ascending("part"),
            sessionID: ctx.sessionID,
            messageID: ctx.messageID,
            type: "file" as const,
            mime,
            url: `data:${mime};base64,${data.toString("base64")}`,
          },
        ],
      }
    }

    const isBinary = await isBinaryFile(filepath)
    if (isBinary) throw new Error(`无法读取二进制文件：${filepath}`)

    const limit = params.limit ?? DEFAULT_READ_LIMIT
    const offset = params.offset ?? 1
    const start = offset - 1
    const text = await fsp.readFile(filepath, "utf-8")
    const lines = text.split("\n")
    if (start >= lines.length)
      throw new Error(
        `偏移量 ${offset} 超出文件范围（该文件共 ${lines.length} 行）`,
      )

    const raw: string[] = []
    let bytes = 0
    let truncatedByBytes = false
    for (let i = start; i < Math.min(lines.length, start + limit); i++) {
      const line =
        lines[i]!.length > MAX_LINE_LENGTH
          ? lines[i]!.substring(0, MAX_LINE_LENGTH) + "..."
          : lines[i]!
      const size = Buffer.byteLength(line, "utf-8") + (raw.length > 0 ? 1 : 0)
      if (bytes + size > MAX_BYTES) {
        truncatedByBytes = true
        break
      }
      raw.push(line)
      bytes += size
    }

    const content = raw.map((line, index) => {
      return `${index + offset}: ${line}`
    })
    const preview = raw.slice(0, 20).join("\n")

    let output = [
      `<path>${filepath}</path>`,
      `<type>file</type>`,
      "<content>",
    ].join("\n")
    output += content.join("\n")

    const totalLines = lines.length
    const lastReadLine = offset + raw.length - 1
    const hasMoreLines = totalLines > lastReadLine
    const truncated = hasMoreLines || truncatedByBytes

    if (truncatedByBytes) {
      output += `\n\n(输出在 ${MAX_BYTES} 字节处截断。使用 'offset' 参数可读取第 ${lastReadLine} 行之后的内容)`
    } else if (hasMoreLines) {
      output += `\n\n(文件还有更多行。使用 'offset' 参数可读取第 ${lastReadLine} 行之后的内容)`
    } else {
      output += `\n\n(文件结束 - 共 ${totalLines} 行)`
    }
    output += "\n</content>"

    return {
      title,
      output,
      metadata: {
        preview,
        truncated,
        loaded: [] as string[],
      },
    }
  },
})

async function isBinaryFile(filepath: string): Promise<boolean> {
  const ext = path.extname(filepath).toLowerCase()
  const binaryExts = new Set([
    ".zip", ".tar", ".gz", ".exe", ".dll", ".so", ".class", ".jar",
    ".war", ".7z", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".odt", ".ods", ".odp", ".bin", ".dat", ".obj", ".o", ".a",
    ".lib", ".wasm", ".pyc", ".pyo",
  ])
  if (binaryExts.has(ext)) return true

  const stat = await fsp.stat(filepath)
  if (stat.size === 0) return false

  const bufferSize = Math.min(4096, stat.size)
  const fd = await fsp.open(filepath, "r")
  try {
    const buffer = Buffer.alloc(bufferSize)
    await fd.read(buffer, 0, bufferSize, 0)

    let nonPrintableCount = 0
    for (let i = 0; i < bufferSize; i++) {
      if (buffer[i] === 0) return true
      if (buffer[i]! < 9 || (buffer[i]! > 13 && buffer[i]! < 32)) {
        nonPrintableCount++
      }
    }
    return nonPrintableCount / bufferSize > 0.3
  } finally {
    await fd.close()
  }
}
