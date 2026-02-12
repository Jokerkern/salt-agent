import z from "zod"
import fsp from "fs/promises"
import path from "path"
import { Tool } from "./tool.js"
import { Workspace } from "../workspace/workspace.js"
import { createTwoFilesPatch } from "diff"
import { assertExternalDirectory } from "./external-directory.js"
import { trimDiff } from "./edit.js"

const DESCRIPTION = `将内容写入文件，若不存在则创建，若存在则覆盖。

用法：
- 始终提供完整文件内容 —— 此工具会覆盖整个文件
- 部分修改请使用 'edit' 工具
- 文件路径必须为绝对路径
- 父目录会自动创建`

export const WriteTool = Tool.define("write", {
  description: DESCRIPTION,
  parameters: z.object({
    content: z.string().describe("要写入文件的内容"),
    filePath: z
      .string()
      .describe(
        "要写入的文件的绝对路径（必须为绝对路径，不能为相对路径）",
      ),
  }),
  async execute(params, ctx) {
    const filepath = path.isAbsolute(params.filePath)
      ? params.filePath
      : path.join(Workspace.directory, params.filePath)
    await assertExternalDirectory(ctx, filepath)

    let exists = false
    let contentOld = ""
    try {
      contentOld = await fsp.readFile(filepath, "utf-8")
      exists = true
    } catch {}

    const diff = trimDiff(
      createTwoFilesPatch(filepath, filepath, contentOld, params.content),
    )
    await ctx.ask({
      permission: "edit",
      patterns: [path.relative(Workspace.worktree, filepath)],
      always: ["*"],
      metadata: {
        filepath,
        diff,
      },
    })

    await fsp.mkdir(path.dirname(filepath), { recursive: true })
    await fsp.writeFile(filepath, params.content, "utf-8")

    return {
      title: path.relative(Workspace.worktree, filepath),
      metadata: {
        filepath,
        exists,
      },
      output: "文件写入成功。",
    }
  },
})
