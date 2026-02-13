import { describe, it, expect } from "vitest"
import { LLM } from "../../src/session/llm.js"
import { Workspace } from "../../src/workspace/workspace.js"

describe("LLM.environmentPrompt", () => {
  it("returns a non-empty string", () => {
    const prompt = LLM.environmentPrompt()
    expect(typeof prompt).toBe("string")
    expect(prompt.length).toBeGreaterThan(0)
  })

  it("includes platform info", () => {
    const prompt = LLM.environmentPrompt()
    expect(prompt).toContain("平台")
  })

  it("includes workspace directory", () => {
    const prompt = LLM.environmentPrompt()
    expect(prompt).toContain(Workspace.directory)
  })

  it("includes current date", () => {
    const prompt = LLM.environmentPrompt()
    const today = new Date().toISOString().split("T")[0]!
    expect(prompt).toContain(today)
  })

  it("includes shell info", () => {
    const prompt = LLM.environmentPrompt()
    expect(prompt).toContain("Shell")
  })

  it("includes usage guidelines", () => {
    const prompt = LLM.environmentPrompt()
    expect(prompt).toContain("工具")
  })
})
