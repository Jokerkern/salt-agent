import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs/promises"
import path from "path"
import os from "os"
import z from "zod"
import { SessionPrompt } from "../../src/session/prompt.js"
import { Session } from "../../src/session/session.js"
import { Storage } from "../../src/storage/storage.js"

const testDir = path.join(os.tmpdir(), `salt-prompt-test-${Date.now()}`)
process.env["SALT_DATA_DIR"] = testDir

async function cleanup() {
  await fs.rm(testDir, { recursive: true, force: true })
  Storage.reset()
}

describe("SessionPrompt", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("PromptInput schema validates minimal input", () => {
    const result = SessionPrompt.PromptInput.parse({
      sessionID: "ses_test123456789012345678",
      parts: [
        { type: "text", text: "Hello" },
      ],
    })
    expect(result.sessionID).toContain("ses_")
    expect(result.parts).toHaveLength(1)
  })

  it("PromptInput schema validates full input", () => {
    const result = SessionPrompt.PromptInput.parse({
      sessionID: "ses_test123456789012345678",
      messageID: "msg_test123456789012345678",
      model: { providerID: "openai", modelID: "gpt-4o" },
      agent: "build",
      noReply: true,
      tools: { read: true, bash: false },
      system: "Custom system prompt",
      variant: "compact",
      parts: [
        { type: "text", text: "Do something" },
      ],
    })
    expect(result.noReply).toBe(true)
    expect(result.tools).toEqual({ read: true, bash: false })
  })

  it("LoopInput schema validates", () => {
    const result = SessionPrompt.LoopInput.parse({
      sessionID: "ses_test123456789012345678",
    })
    expect(result.sessionID).toContain("ses_")
  })

  it("LoopInput schema accepts resume_existing", () => {
    const result = SessionPrompt.LoopInput.parse({
      sessionID: "ses_test123456789012345678",
      resume_existing: true,
    })
    expect(result.resume_existing).toBe(true)
  })

  it("assertNotBusy does not throw for idle session", () => {
    expect(() => SessionPrompt.assertNotBusy("ses_idle")).not.toThrow()
  })

  it("cancel does not throw for non-existent session", () => {
    expect(() => SessionPrompt.cancel("ses_nonexistent")).not.toThrow()
  })
})
