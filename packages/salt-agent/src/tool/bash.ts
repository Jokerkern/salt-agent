import z from "zod"
import { spawn } from "child_process"
import { Tool } from "./tool.js"
import { Workspace } from "../workspace/workspace.js"
import { Shell } from "../shell/shell.js"
import { Log } from "../util/log.js"
import { Truncate } from "./truncation.js"

const MAX_METADATA_LENGTH = 30_000
const DEFAULT_TIMEOUT = 2 * 60 * 1000 // 2 minutes

const log = Log.create({ service: "shell-tool" })

/**
 * Create a shell tool for a specific shell.
 */
function createShellTool(info: Shell.ShellInfo): Tool.Info {
  return Tool.define(info.id, async () => {
    log.info("shell tool registered", { id: info.id, name: info.name, path: info.path })

    return {
      description: `在 ${info.name} 中执行命令。

用法：
- 当前 shell: ${info.name}，请生成与之兼容的命令语法
- 默认超时 2 分钟（可配置）
- 工作目录默认为项目目录
- 使用 'workdir' 参数代替 'cd' 命令
- 输出限制为 ${Truncate.MAX_LINES} 行 / ${Truncate.MAX_BYTES} 字节`,
      parameters: z.object({
        command: z.string().describe("要执行的命令"),
        timeout: z
          .number()
          .describe("可选超时时间（毫秒）")
          .optional(),
        workdir: z
          .string()
          .describe(
            `命令运行的工作目录。默认为 ${Workspace.directory}。使用此参数代替 'cd' 命令。`,
          )
          .optional(),
        description: z
          .string()
          .describe("简洁描述此命令的作用（5–10 个字）。"),
      }),
      async execute(params, ctx) {
        const cwd = params.workdir || Workspace.directory
        if (params.timeout !== undefined && params.timeout < 0) {
          throw new Error(
            `无效的超时值：${params.timeout}。超时必须为正数。`,
          )
        }
        const timeout = params.timeout ?? DEFAULT_TIMEOUT

        // Permission check for external directories
        if (!Workspace.containsPath(cwd)) {
          await ctx.ask({
            permission: "external_directory",
            patterns: [cwd + "/*"],
            always: [cwd + "/*"],
            metadata: {},
          })
        }

        // Permission check for the command itself
        await ctx.ask({
          permission: info.id,
          patterns: [params.command],
          always: ["*"],
          metadata: {},
        })

        const proc = spawn(params.command, {
          shell: info.path,
          cwd,
          env: { ...process.env },
          stdio: ["ignore", "pipe", "pipe"],
          detached: process.platform !== "win32",
        })

        let output = ""

        ctx.metadata({
          metadata: {
            output: "",
            description: params.description,
          },
        })

        const append = (chunk: Buffer) => {
          output += chunk.toString()
          ctx.metadata({
            metadata: {
              output:
                output.length > MAX_METADATA_LENGTH
                  ? output.slice(0, MAX_METADATA_LENGTH) + "\n\n..."
                  : output,
              description: params.description,
            },
          })
        }

        proc.stdout?.on("data", append)
        proc.stderr?.on("data", append)

        let timedOut = false
        let aborted = false
        let exited = false

        const kill = () => Shell.killTree(proc, { exited: () => exited })

        if (ctx.abort.aborted) {
          aborted = true
          await kill()
        }

        const abortHandler = () => {
          aborted = true
          void kill()
        }

        ctx.abort.addEventListener("abort", abortHandler, { once: true })

        const timeoutTimer = setTimeout(() => {
          timedOut = true
          void kill()
        }, timeout + 100)

        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            clearTimeout(timeoutTimer)
            ctx.abort.removeEventListener("abort", abortHandler)
          }

          proc.once("exit", () => {
            exited = true
            cleanup()
            resolve()
          })

          proc.once("error", (error) => {
            exited = true
            cleanup()
            reject(error)
          })
        })

        const resultMetadata: string[] = []
        if (timedOut) {
          resultMetadata.push(
            `命令在超时 ${timeout} 毫秒后被终止`,
          )
        }
        if (aborted) {
          resultMetadata.push("用户已中止命令")
        }
        if (resultMetadata.length > 0) {
          output +=
            "\n\n<shell_metadata>\n" +
            resultMetadata.join("\n") +
            "\n</shell_metadata>"
        }

        return {
          title: params.description,
          metadata: {
            output:
              output.length > MAX_METADATA_LENGTH
                ? output.slice(0, MAX_METADATA_LENGTH) + "\n\n..."
                : output,
            exit: proc.exitCode,
            description: params.description,
          },
          output,
        }
      },
    }
  })
}

/**
 * Dynamically create shell tools for all detected shells.
 */
export const ShellTools: Tool.Info[] = Shell.available().map(createShellTool)
