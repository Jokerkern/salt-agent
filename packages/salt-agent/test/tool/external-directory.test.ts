import { describe, it, expect, afterEach } from "vitest"
import path from "path"
import { assertExternalDirectory } from "../../src/tool/external-directory.js"
import { Workspace } from "../../src/workspace/workspace.js"
import type { Tool } from "../../src/tool/tool.js"

const original = {
  directory: Workspace.directory,
  worktree: Workspace.worktree,
}

afterEach(() => {
  Workspace.directory = original.directory
  Workspace.worktree = original.worktree
})

function mockContext(overrides?: Partial<Tool.Context>): Tool.Context {
  const asked: Array<{ permission: string; patterns: string[] }> = []
  return {
    sessionID: "ses_test",
    messageID: "msg_test",
    agent: "build",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => {},
    ask: async (input) => {
      asked.push({ permission: input.permission, patterns: input.patterns })
    },
    get extra() {
      return { asked }
    },
    ...overrides,
  } as any
}

describe("assertExternalDirectory", () => {
  it("does nothing for undefined target", async () => {
    const ctx = mockContext()
    await assertExternalDirectory(ctx, undefined)
    // No ask called
    expect((ctx as any).extra.asked).toHaveLength(0)
  })

  it("does nothing when bypass is true", async () => {
    Workspace.setDirectory("/project")
    const ctx = mockContext()
    await assertExternalDirectory(ctx, "/outside/file.ts", { bypass: true })
    expect((ctx as any).extra.asked).toHaveLength(0)
  })

  it("does nothing for path inside workspace", async () => {
    Workspace.setDirectory("/project")
    const ctx = mockContext()
    await assertExternalDirectory(ctx, "/project/src/file.ts")
    expect((ctx as any).extra.asked).toHaveLength(0)
  })

  it("asks permission for path outside workspace", async () => {
    Workspace.setDirectory("/project")
    const ctx = mockContext()
    await assertExternalDirectory(ctx, "/other/file.ts")
    expect((ctx as any).extra.asked).toHaveLength(1)
    expect((ctx as any).extra.asked[0].permission).toBe("external_directory")
  })

  it("uses directory target for kind=directory", async () => {
    Workspace.setDirectory("/project")
    const ctx = mockContext()
    await assertExternalDirectory(ctx, "/other/dir", { kind: "directory" })
    expect((ctx as any).extra.asked).toHaveLength(1)
    const pattern: string = (ctx as any).extra.asked[0].patterns[0]
    // Normalize separators for cross-platform
    const normalized = pattern.replace(/\\/g, "/")
    expect(normalized).toContain("/other/dir")
  })

  it("uses parent directory for kind=file (default)", async () => {
    Workspace.setDirectory("/project")
    const ctx = mockContext()
    await assertExternalDirectory(ctx, "/other/dir/file.ts")
    expect((ctx as any).extra.asked).toHaveLength(1)
    const pattern: string = (ctx as any).extra.asked[0].patterns[0]
    const normalized = pattern.replace(/\\/g, "/")
    expect(normalized).toContain("/other/dir")
  })
})
