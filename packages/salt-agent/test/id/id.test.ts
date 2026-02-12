import { describe, it, expect } from "vitest"
import { Identifier } from "../../src/id/id.js"

describe("Identifier", () => {
  it("ascending generates IDs with correct prefix", () => {
    const id = Identifier.ascending("session")
    expect(id).toMatch(/^ses_/)
  })

  it("ascending generates IDs with correct prefix for message", () => {
    const id = Identifier.ascending("message")
    expect(id).toMatch(/^msg_/)
  })

  it("ascending generates IDs with correct prefix for part", () => {
    const id = Identifier.ascending("part")
    expect(id).toMatch(/^prt_/)
  })

  it("descending generates IDs with correct prefix", () => {
    const id = Identifier.descending("session")
    expect(id).toMatch(/^ses_/)
  })

  it("ascending IDs are monotonically increasing", () => {
    const ids = Array.from({ length: 10 }, () => Identifier.ascending("message"))
    const sorted = [...ids].sort()
    expect(ids).toEqual(sorted)
  })

  it("descending IDs are monotonically decreasing", () => {
    const ids = Array.from({ length: 10 }, () => Identifier.descending("session"))
    const sorted = [...ids].sort().reverse()
    expect(ids).toEqual(sorted)
  })

  it("ascending with given ID returns it unchanged", () => {
    const id = Identifier.ascending("session", "ses_abc123")
    expect(id).toBe("ses_abc123")
  })

  it("ascending with wrong prefix throws", () => {
    expect(() => Identifier.ascending("session", "msg_abc123")).toThrow()
  })

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => Identifier.ascending("message")))
    expect(ids.size).toBe(100)
  })

  // Note: timestamp() has a known 48-bit truncation issue (same as opencode).
  // The function works for ordering but not for extracting exact timestamps
  // at current epoch values. Not critical — IDs sort correctly regardless.
})
