import { describe, it, expect, afterEach } from "vitest"
import path from "path"
import { Workspace } from "../../src/workspace/workspace.js"

describe("Workspace", () => {
  const original = {
    directory: Workspace.directory,
    worktree: Workspace.worktree,
  }

  afterEach(() => {
    Workspace.directory = original.directory
    Workspace.worktree = original.worktree
  })

  it("defaults to process.cwd()", () => {
    expect(Workspace.directory).toBe(process.cwd())
    expect(Workspace.worktree).toBe(process.cwd())
  })

  it("setDirectory updates both directory and worktree", () => {
    Workspace.setDirectory("/test/project")
    expect(Workspace.directory).toBe(path.resolve("/test/project"))
    expect(Workspace.worktree).toBe(path.resolve("/test/project"))
  })

  it("setWorktree updates only worktree", () => {
    Workspace.setDirectory("/test/project")
    Workspace.setWorktree("/test/worktree")
    expect(Workspace.directory).toBe(path.resolve("/test/project"))
    expect(Workspace.worktree).toBe(path.resolve("/test/worktree"))
  })

  it("containsPath returns true for files inside directory", () => {
    Workspace.setDirectory("/test/project")
    expect(Workspace.containsPath("/test/project/src/file.ts")).toBe(true)
  })

  it("containsPath returns true for the directory itself", () => {
    Workspace.setDirectory("/test/project")
    expect(Workspace.containsPath("/test/project")).toBe(true)
  })

  it("containsPath returns false for files outside directory", () => {
    Workspace.setDirectory("/test/project")
    expect(Workspace.containsPath("/other/path/file.ts")).toBe(false)
  })

  it("containsPath returns false for sibling paths with same prefix", () => {
    Workspace.setDirectory("/test/project")
    // /test/project-other should NOT match /test/project
    expect(Workspace.containsPath("/test/project-other/file.ts")).toBe(false)
  })

  it("setDirectory resolves relative paths", () => {
    Workspace.setDirectory("relative/path")
    expect(path.isAbsolute(Workspace.directory)).toBe(true)
  })
})
