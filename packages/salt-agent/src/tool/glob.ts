import z from "zod"
import fsp from "fs/promises"
import path from "path"
import { Tool } from "./tool.js"
import { Ripgrep } from "../ripgrep/ripgrep.js"
import { Workspace } from "../workspace/workspace.js"
import { assertExternalDirectory } from "./external-directory.js"

const DESCRIPTION = `按 glob 模式搜索匹配的文件。

用法：
- 返回匹配的文件路径，按修改时间排序（最新优先）
- 最多返回 100 条结果
- 适用于按文件名模式查找文件`

export const GlobTool = Tool.define("glob", {
  description: DESCRIPTION,
  parameters: z.object({
    pattern: z.string().describe("用于匹配文件的 glob 模式"),
    path: z
      .string()
      .optional()
      .describe(
        "搜索目录。未指定时使用当前工作目录。",
      ),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "glob",
      patterns: [params.pattern],
      always: ["*"],
      metadata: {
        pattern: params.pattern,
        path: params.path,
      },
    })

    let search = params.path ?? Workspace.directory
    search = path.isAbsolute(search)
      ? search
      : path.resolve(Workspace.directory, search)
    await assertExternalDirectory(ctx, search, { kind: "directory" })

    const limit = 100
    const files: { path: string; mtime: number }[] = []
    let truncated = false

    for await (const file of Ripgrep.files({
      cwd: search,
      glob: [params.pattern],
      signal: ctx.abort,
    })) {
      if (files.length >= limit) {
        truncated = true
        break
      }
      const full = path.resolve(search, file)
      let mtime = 0
      try {
        const stats = await fsp.stat(full)
        mtime = stats.mtime.getTime()
      } catch {}
      files.push({ path: full, mtime })
    }

    files.sort((a, b) => b.mtime - a.mtime)

    const output: string[] = []
    if (files.length === 0) {
      output.push("未找到匹配文件")
    } else {
      output.push(...files.map((f) => f.path))
      if (truncated) {
        output.push("")
        output.push(
          `(结果已截断：仅显示前 ${limit} 条。建议使用更具体的路径或模式。)`,
        )
      }
    }

    return {
      title: path.relative(Workspace.worktree, search),
      metadata: { count: files.length, truncated },
      output: output.join("\n"),
    }
  },
})
