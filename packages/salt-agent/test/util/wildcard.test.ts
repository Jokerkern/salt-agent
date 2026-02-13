import { describe, it, expect } from "vitest"
import { Wildcard } from "../../src/util/wildcard.js"

describe("Wildcard.match", () => {
  it("exact match", () => {
    expect(Wildcard.match("hello", "hello")).toBe(true)
  })

  it("no match", () => {
    expect(Wildcard.match("hello", "world")).toBe(false)
  })

  it("* matches any string", () => {
    expect(Wildcard.match("anything", "*")).toBe(true)
    expect(Wildcard.match("", "*")).toBe(true)
  })

  it("prefix wildcard", () => {
    expect(Wildcard.match("test.ts", "*.ts")).toBe(true)
    expect(Wildcard.match("test.js", "*.ts")).toBe(false)
  })

  it("suffix wildcard", () => {
    expect(Wildcard.match("src/file.ts", "src/*")).toBe(true)
  })

  it("middle wildcard", () => {
    expect(Wildcard.match("abc/xyz/def", "abc/*/def")).toBe(true)
  })

  it("? matches single character", () => {
    expect(Wildcard.match("ab", "a?")).toBe(true)
    expect(Wildcard.match("abc", "a?")).toBe(false)
  })

  it("trailing space+wildcard makes trailing optional", () => {
    // "ls *" should match both "ls" and "ls -la"
    expect(Wildcard.match("ls", "ls *")).toBe(true)
    expect(Wildcard.match("ls -la", "ls *")).toBe(true)
    expect(Wildcard.match("ls -la --color", "ls *")).toBe(true)
  })

  it("escapes regex special chars", () => {
    expect(Wildcard.match("file.ts", "file.ts")).toBe(true)
    expect(Wildcard.match("filets", "file.ts")).toBe(false)
  })

  it("escapes more regex chars", () => {
    expect(Wildcard.match("a+b", "a+b")).toBe(true)
    expect(Wildcard.match("a[b]c", "a[b]c")).toBe(true)
    expect(Wildcard.match("a(b)c", "a(b)c")).toBe(true)
  })
})

describe("Wildcard.all", () => {
  it("returns last matching value", () => {
    const patterns = {
      "*": "default",
      "read": "specific",
    }
    expect(Wildcard.all("read", patterns)).toBe("specific")
    expect(Wildcard.all("write", patterns)).toBe("default")
  })

  it("returns undefined when no match", () => {
    expect(Wildcard.all("test", {})).toBeUndefined()
  })

  it("longer patterns take precedence (sorted by length)", () => {
    const patterns = {
      "*": "any",
      "*.env": "env",
      "*.env.*": "env-dotted",
    }
    expect(Wildcard.all(".env", patterns)).toBe("env")
    expect(Wildcard.all(".env.local", patterns)).toBe("env-dotted")
    expect(Wildcard.all("readme.md", patterns)).toBe("any")
  })

  it("returns undefined for empty patterns", () => {
    expect(Wildcard.all("anything", {})).toBeUndefined()
  })
})
