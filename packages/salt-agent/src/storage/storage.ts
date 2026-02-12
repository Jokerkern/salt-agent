import path from "path"
import fs from "fs/promises"
import z from "zod"
import { Global } from "../global/global.js"
import { lazy } from "../util/lazy.js"
import { Lock } from "../util/lock.js"
import { NamedError } from "../util/error.js"

export namespace Storage {
  export const NotFoundError = NamedError.create(
    "NotFoundError",
    z.object({
      message: z.string(),
    }),
  )

  const state = lazy(async () => {
    const dir = Global.Path.storage
    await fs.mkdir(dir, { recursive: true })
    return { dir }
  })

  /** Reset internal state. For testing only. */
  export function reset() {
    state.reset()
  }

  function resolve(dir: string, key: string[]): string {
    return path.join(dir, ...key) + ".json"
  }

  export async function read<T>(key: string[]): Promise<T> {
    const { dir } = await state()
    const target = resolve(dir, key)
    const unlock = await Lock.read(target)
    try {
      return await withErrorHandling(target, async () => {
        const content = await fs.readFile(target, "utf-8")
        return JSON.parse(content) as T
      })
    } finally {
      unlock()
    }
  }

  export async function write<T>(key: string[], content: T): Promise<void> {
    const { dir } = await state()
    const target = resolve(dir, key)
    const unlock = await Lock.write(target)
    try {
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, JSON.stringify(content, null, 2))
    } finally {
      unlock()
    }
  }

  export async function update<T>(key: string[], fn: (draft: T) => void): Promise<T> {
    const { dir } = await state()
    const target = resolve(dir, key)
    const unlock = await Lock.write(target)
    try {
      return await withErrorHandling(target, async () => {
        const raw = await fs.readFile(target, "utf-8")
        const content = JSON.parse(raw) as T
        fn(content)
        await fs.writeFile(target, JSON.stringify(content, null, 2))
        return content
      })
    } finally {
      unlock()
    }
  }

  export async function remove(key: string[]): Promise<void> {
    const { dir } = await state()
    const target = resolve(dir, key)
    await fs.unlink(target).catch(() => {})
  }

  export async function list(prefix: string[]): Promise<string[][]> {
    const { dir } = await state()
    const target = path.join(dir, ...prefix)
    try {
      const entries = await fs.readdir(target, { recursive: true })
      const result = entries
        .filter((entry) => entry.endsWith(".json"))
        .map((entry) => {
          const relative = entry.slice(0, -5) // remove .json
          return [...prefix, ...relative.split(path.sep)]
        })
      result.sort((a, b) => a.join("/").localeCompare(b.join("/")))
      return result
    } catch {
      return []
    }
  }

  async function withErrorHandling<T>(target: string, body: () => Promise<T>): Promise<T> {
    try {
      return await body()
    } catch (e) {
      if (!(e instanceof Error)) throw e
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        throw new NotFoundError({ message: `Resource not found: ${target}` })
      }
      throw e
    }
  }
}
