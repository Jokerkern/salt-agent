import z from "zod"
import path from "path"
import fsp from "fs/promises"
import { Tool } from "./tool.js"
import { Patch } from "../patch/patch.js"
import { Workspace } from "../workspace/workspace.js"
import { createTwoFilesPatch, diffLines } from "diff"
import { assertExternalDirectory } from "./external-directory.js"
import { trimDiff } from "./edit.js"

const DESCRIPTION = `将补丁应用到一个或多个文件。

补丁格式为：
\`\`\`
*** Begin Patch
*** Add File: path/to/new/file.txt
+新文件的第一行
+新文件的第二行

*** Update File: path/to/existing/file.txt
@@ 上下文行（用于定位修改位置）
 保留的行
-要删除的行
+要添加的行

*** Delete File: path/to/old/file.txt
*** End Patch
\`\`\`

用法：
- 单个补丁可包含多个文件的添加、修改、删除和移动操作
- Update 块中 @@ 后可跟上下文标记（如函数名）帮助定位
- 空格开头的行表示保留，-开头表示删除，+开头表示添加
- 移动文件可在 Update File 后加 *** Move to: 新路径`

export const ApplyPatchTool = Tool.define("apply_patch", {
  description: DESCRIPTION,
  parameters: z.object({
    patchText: z
      .string()
      .describe("描述所有待应用修改的完整补丁文本"),
  }),
  async execute(params, ctx) {
    if (!params.patchText) {
      throw new Error("patchText 为必填项")
    }

    // Parse the patch
    let hunks: Patch.Hunk[]
    try {
      const parseResult = Patch.parsePatch(params.patchText)
      hunks = parseResult.hunks
    } catch (error) {
      throw new Error(`apply_patch 解析失败: ${error}`)
    }

    if (hunks.length === 0) {
      const normalized = params.patchText
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim()
      if (normalized === "*** Begin Patch\n*** End Patch") {
        throw new Error("补丁被拒绝：空补丁")
      }
      throw new Error("apply_patch 解析失败：未找到任何 hunk")
    }

    // Validate paths and compute diffs for each hunk
    const fileChanges: Array<{
      filePath: string
      oldContent: string
      newContent: string
      type: "add" | "update" | "delete" | "move"
      movePath?: string
      diff: string
      additions: number
      deletions: number
    }> = []

    let totalDiff = ""

    for (const hunk of hunks) {
      const filePath = path.isAbsolute(hunk.path)
        ? hunk.path
        : path.resolve(Workspace.directory, hunk.path)
      await assertExternalDirectory(ctx, filePath)

      switch (hunk.type) {
        case "add": {
          const oldContent = ""
          const newContent =
            hunk.contents.length === 0 || hunk.contents.endsWith("\n")
              ? hunk.contents
              : `${hunk.contents}\n`
          const diff = trimDiff(
            createTwoFilesPatch(filePath, filePath, oldContent, newContent),
          )

          let additions = 0
          let deletions = 0
          for (const change of diffLines(oldContent, newContent)) {
            if (change.added) additions += change.count || 0
            if (change.removed) deletions += change.count || 0
          }

          fileChanges.push({
            filePath,
            oldContent,
            newContent,
            type: "add",
            diff,
            additions,
            deletions,
          })

          totalDiff += diff + "\n"
          break
        }

        case "update": {
          const stats = await fsp.stat(filePath).catch(() => null)
          if (!stats || stats.isDirectory()) {
            throw new Error(
              `apply_patch 验证失败：无法读取要更新的文件: ${filePath}`,
            )
          }

          const oldContent = await fsp.readFile(filePath, "utf-8")
          let newContent = oldContent

          try {
            const fileUpdate = Patch.deriveNewContentsFromChunks(
              filePath,
              hunk.chunks,
            )
            newContent = fileUpdate.content
          } catch (error) {
            throw new Error(`apply_patch 验证失败: ${error}`)
          }

          const diff = trimDiff(
            createTwoFilesPatch(filePath, filePath, oldContent, newContent),
          )

          let additions = 0
          let deletions = 0
          for (const change of diffLines(oldContent, newContent)) {
            if (change.added) additions += change.count || 0
            if (change.removed) deletions += change.count || 0
          }

          const movePath = hunk.move_path
            ? path.isAbsolute(hunk.move_path)
              ? hunk.move_path
              : path.resolve(Workspace.directory, hunk.move_path)
            : undefined
          if (movePath) {
            await assertExternalDirectory(ctx, movePath)
          }

          fileChanges.push({
            filePath,
            oldContent,
            newContent,
            type: hunk.move_path ? "move" : "update",
            movePath,
            diff,
            additions,
            deletions,
          })

          totalDiff += diff + "\n"
          break
        }

        case "delete": {
          const contentToDelete = await fsp
            .readFile(filePath, "utf-8")
            .catch((error) => {
              throw new Error(`apply_patch 验证失败: ${error}`)
            })
          const deleteDiff = trimDiff(
            createTwoFilesPatch(filePath, filePath, contentToDelete, ""),
          )
          const deletions = contentToDelete.split("\n").length

          fileChanges.push({
            filePath,
            oldContent: contentToDelete,
            newContent: "",
            type: "delete",
            diff: deleteDiff,
            additions: 0,
            deletions,
          })

          totalDiff += deleteDiff + "\n"
          break
        }
      }
    }

    // Build per-file metadata for UI
    const files = fileChanges.map((change) => ({
      filePath: change.filePath,
      relativePath: path.relative(
        Workspace.worktree,
        change.movePath ?? change.filePath,
      ),
      type: change.type,
      diff: change.diff,
      before: change.oldContent,
      after: change.newContent,
      additions: change.additions,
      deletions: change.deletions,
      movePath: change.movePath,
    }))

    // Request permission
    const relativePaths = fileChanges.map((c) =>
      path.relative(Workspace.worktree, c.filePath),
    )
    await ctx.ask({
      permission: "edit",
      patterns: relativePaths,
      always: ["*"],
      metadata: {
        filepath: relativePaths.join(", "),
        diff: totalDiff,
        files,
      },
    })

    // Apply the changes
    for (const change of fileChanges) {
      switch (change.type) {
        case "add":
          await fsp.mkdir(path.dirname(change.filePath), { recursive: true })
          await fsp.writeFile(change.filePath, change.newContent, "utf-8")
          break

        case "update":
          await fsp.writeFile(change.filePath, change.newContent, "utf-8")
          break

        case "move":
          if (change.movePath) {
            await fsp.mkdir(path.dirname(change.movePath), { recursive: true })
            await fsp.writeFile(
              change.movePath,
              change.newContent,
              "utf-8",
            )
            await fsp.unlink(change.filePath)
          }
          break

        case "delete":
          await fsp.unlink(change.filePath)
          break
      }
    }

    // Generate output summary
    const summaryLines = fileChanges.map((change) => {
      const rel = path.relative(
        Workspace.worktree,
        change.movePath ?? change.filePath,
      )
      switch (change.type) {
        case "add":
          return `A ${rel}`
        case "delete":
          return `D ${rel}`
        case "move":
          return `M ${rel} (moved from ${path.relative(Workspace.worktree, change.filePath)})`
        default:
          return `M ${rel}`
      }
    })

    const output = `补丁应用成功。已更新以下文件：\n${summaryLines.join("\n")}`

    return {
      title: output,
      metadata: {
        diff: totalDiff,
        files,
      },
      output,
    }
  },
})
