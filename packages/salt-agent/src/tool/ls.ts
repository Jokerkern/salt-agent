import z from "zod"
import path from "path"
import { Tool } from "./tool.js"
import { Ripgrep } from "../ripgrep/ripgrep.js"
import { Workspace } from "../workspace/workspace.js"
import { assertExternalDirectory } from "./external-directory.js"

export const IGNORE_PATTERNS = [
  "node_modules/",
  "__pycache__/",
  ".git/",
  "dist/",
  "build/",
  "target/",
  "vendor/",
  "bin/",
  "obj/",
  ".idea/",
  ".vscode/",
  ".zig-cache/",
  "zig-out",
  ".coverage",
  "coverage/",
  "tmp/",
  "temp/",
  ".cache/",
  "cache/",
  "logs/",
  ".venv/",
  "venv/",
  "env/",
]

const LIMIT = 100

const DESCRIPTION = `以树形结构列出文件和目录。

用法：
- 默认忽略常见构建/依赖目录
- 最多显示 100 个文件
- 使用 'ignore' 添加额外排除模式`

export const ListTool = Tool.define("list", {
  description: DESCRIPTION,
  parameters: z.object({
    path: z
      .string()
      .describe(
        "要列出的目录的绝对路径（必须为绝对路径，不能为相对路径）",
      )
      .optional(),
    ignore: z
      .array(z.string())
      .describe("要忽略的 glob 模式列表")
      .optional(),
  }),
  async execute(params, ctx) {
    const searchPath = path.resolve(Workspace.directory, params.path || ".")
    await assertExternalDirectory(ctx, searchPath, { kind: "directory" })

    await ctx.ask({
      permission: "list",
      patterns: [searchPath],
      always: ["*"],
      metadata: { path: searchPath },
    })

    const ignoreGlobs = IGNORE_PATTERNS.map((p) => `!${p}*`).concat(
      params.ignore?.map((p) => `!${p}`) || [],
    )
    const files: string[] = []
    for await (const file of Ripgrep.files({
      cwd: searchPath,
      glob: ignoreGlobs,
      signal: ctx.abort,
    })) {
      files.push(file)
      if (files.length >= LIMIT) break
    }

    // Build directory structure
    const dirs = new Set<string>()
    const filesByDir = new Map<string, string[]>()
    for (const file of files) {
      const dir = path.dirname(file)
      const parts = dir === "." ? [] : dir.split("/")

      for (let i = 0; i <= parts.length; i++) {
        const dirPath = i === 0 ? "." : parts.slice(0, i).join("/")
        dirs.add(dirPath)
      }

      if (!filesByDir.has(dir)) filesByDir.set(dir, [])
      filesByDir.get(dir)!.push(path.basename(file))
    }

    function renderDir(dirPath: string, depth: number): string {
      const indent = "  ".repeat(depth)
      let output = ""

      if (depth > 0) {
        output += `${indent}${path.basename(dirPath)}/\n`
      }

      const childIndent = "  ".repeat(depth + 1)
      const children = Array.from(dirs)
        .filter((d) => path.dirname(d) === dirPath && d !== dirPath)
        .sort()

      for (const child of children) {
        output += renderDir(child, depth + 1)
      }

      const dirFiles = filesByDir.get(dirPath) || []
      for (const file of dirFiles.sort()) {
        output += `${childIndent}${file}\n`
      }

      return output
    }

    const output = `${searchPath}/\n` + renderDir(".", 0)

    return {
      title: path.relative(Workspace.worktree, searchPath),
      metadata: {
        count: files.length,
        truncated: files.length >= LIMIT,
      },
      output,
    }
  },
})
