import z from "zod"
import fsp from "fs/promises"
import path from "path"
import { Tool } from "./tool.js"
import { Workspace } from "../workspace/workspace.js"
import { assertExternalDirectory } from "./external-directory.js"

const DESCRIPTION = `删除指定的文件或空目录。

用法：
- 文件路径必须为绝对路径
- 仅可删除单个文件或空目录，不支持递归删除
- 不可删除非空目录（防止误删大量文件）
- 删除操作不可撤销，请谨慎使用`

export const DeleteTool = Tool.define("delete", {
  description: DESCRIPTION,
  parameters: z.object({
    filePath: z
      .string()
      .describe("要删除的文件或空目录的绝对路径"),
  }),
  async execute(params, ctx) {
    if (!params.filePath) {
      throw new Error("filePath 为必填项")
    }

    const filepath = path.isAbsolute(params.filePath)
      ? params.filePath
      : path.resolve(Workspace.directory, params.filePath)
    await assertExternalDirectory(ctx, filepath)

    // Check existence and type
    let stats: Awaited<ReturnType<typeof fsp.stat>>
    try {
      stats = await fsp.stat(filepath)
    } catch {
      throw new Error(`路径不存在：${filepath}`)
    }

    if (stats.isDirectory()) {
      // Only allow deleting empty directories
      const entries = await fsp.readdir(filepath)
      if (entries.length > 0) {
        throw new Error(
          `拒绝删除非空目录：${filepath}（包含 ${entries.length} 个条目）。如确需递归删除，请使用 bash 工具。`,
        )
      }
    }

    const relativePath = path.relative(Workspace.worktree, filepath)
    const isDir = stats.isDirectory()

    // Request permission
    await ctx.ask({
      permission: "delete",
      patterns: [relativePath],
      always: [],
      metadata: {
        filepath,
        type: isDir ? "directory" : "file",
        size: isDir ? 0 : stats.size,
      },
    })

    // Perform deletion
    if (isDir) {
      await fsp.rmdir(filepath)
    } else {
      await fsp.unlink(filepath)
    }

    return {
      title: relativePath,
      metadata: {
        filepath,
        type: isDir ? "directory" : "file",
      },
      output: isDir
        ? `已删除空目录：${relativePath}`
        : `已删除文件：${relativePath}`,
    }
  },
})
