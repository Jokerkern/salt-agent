import z from "zod"
import { spawn } from "child_process"
import fsp from "fs/promises"
import path from "path"
import { Tool } from "./tool.js"
import { Ripgrep } from "../ripgrep/ripgrep.js"
import { Workspace } from "../workspace/workspace.js"
import { assertExternalDirectory } from "./external-directory.js"

const MAX_LINE_LENGTH = 2000

const DESCRIPTION = `使用 ripgrep 在文件内容中搜索正则表达式。

用法：
- 支持完整正则语法
- 结果按文件修改时间排序（最新优先）
- 使用 'include' 参数过滤文件
- 最多返回 100 条匹配`

export const GrepTool = Tool.define("grep", {
  description: DESCRIPTION,
  parameters: z.object({
    pattern: z
      .string()
      .describe("在文件内容中搜索的正则表达式"),
    path: z
      .string()
      .optional()
      .describe(
        "搜索目录。默认为当前工作目录。",
      ),
    include: z
      .string()
      .optional()
      .describe(
        '搜索中包含的文件模式（如 "*.js"、"*.{ts,tsx}"）',
      ),
  }),
  async execute(params, ctx) {
    if (!params.pattern) {
      throw new Error("pattern 为必填项")
    }

    await ctx.ask({
      permission: "grep",
      patterns: [params.pattern],
      always: ["*"],
      metadata: {
        pattern: params.pattern,
        path: params.path,
        include: params.include,
      },
    })

    let searchPath = params.path ?? Workspace.directory
    searchPath = path.isAbsolute(searchPath)
      ? searchPath
      : path.resolve(Workspace.directory, searchPath)
    await assertExternalDirectory(ctx, searchPath, { kind: "directory" })

    const rgPath = await Ripgrep.filepath()
    const args = [
      "-nH",
      "--hidden",
      "--no-messages",
      "--field-match-separator=|",
      "--regexp",
      params.pattern,
    ]
    if (params.include) {
      args.push("--glob", params.include)
    }
    args.push(searchPath)

    const proc = spawn(rgPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    })

    if (ctx.abort.aborted) {
      proc.kill()
    } else {
      ctx.abort.addEventListener("abort", () => proc.kill(), { once: true })
    }

    let output = ""
    let errorOutput = ""
    for await (const chunk of proc.stdout!) {
      output += chunk.toString()
    }
    for await (const chunk of proc.stderr!) {
      errorOutput += chunk.toString()
    }

    const exitCode = await new Promise<number | null>((resolve) => {
      proc.on("exit", resolve)
    })

    if (exitCode === 1 || (exitCode === 2 && !output.trim())) {
      return {
        title: params.pattern,
        metadata: { matches: 0, truncated: false },
        output: "未找到匹配文件",
      }
    }

    if (exitCode !== 0 && exitCode !== 2) {
      throw new Error(`ripgrep 执行失败：${errorOutput}`)
    }

    const lines = output.trim().split(/\r?\n/)
    const matches: {
      path: string
      modTime: number
      lineNum: number
      lineText: string
    }[] = []

    for (const line of lines) {
      if (!line) continue
      const [filePath, lineNumStr, ...lineTextParts] = line.split("|")
      if (!filePath || !lineNumStr || lineTextParts.length === 0) continue

      const lineNum = parseInt(lineNumStr, 10)
      const lineText = lineTextParts.join("|")

      let modTime = 0
      try {
        const stats = await fsp.stat(filePath)
        modTime = stats.mtime.getTime()
      } catch {}

      matches.push({ path: filePath, modTime, lineNum, lineText })
    }

    matches.sort((a, b) => b.modTime - a.modTime)

    const limit = 100
    const truncated = matches.length > limit
    const finalMatches = truncated ? matches.slice(0, limit) : matches

    if (finalMatches.length === 0) {
      return {
        title: params.pattern,
        metadata: { matches: 0, truncated: false },
        output: "未找到匹配文件",
      }
    }

    const totalMatches = matches.length
    const outputLines = [
      `找到 ${totalMatches} 条匹配${truncated ? `（显示前 ${limit} 条）` : ""}`,
    ]

    let currentFile = ""
    for (const match of finalMatches) {
      if (currentFile !== match.path) {
        if (currentFile !== "") outputLines.push("")
        currentFile = match.path
        outputLines.push(`${match.path}:`)
      }
      const truncatedLineText =
        match.lineText.length > MAX_LINE_LENGTH
          ? match.lineText.substring(0, MAX_LINE_LENGTH) + "..."
          : match.lineText
      outputLines.push(`  第 ${match.lineNum} 行：${truncatedLineText}`)
    }

    if (truncated) {
      outputLines.push("")
      outputLines.push(
        `(结果已截断：显示 ${limit}/${totalMatches} 条匹配，${totalMatches - limit} 条被隐藏。建议使用更具体的路径或模式。)`,
      )
    }

    if (exitCode === 2) {
      outputLines.push("")
      outputLines.push("(部分路径无法访问，已跳过)")
    }

    return {
      title: params.pattern,
      metadata: { matches: totalMatches, truncated },
      output: outputLines.join("\n"),
    }
  },
})
