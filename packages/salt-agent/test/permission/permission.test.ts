import { describe, it, expect } from "vitest"
import { Permission } from "../../src/permission/permission.js"

describe("Permission.Action", () => {
  it("accepts valid actions", () => {
    expect(Permission.Action.parse("allow")).toBe("allow")
    expect(Permission.Action.parse("deny")).toBe("deny")
    expect(Permission.Action.parse("ask")).toBe("ask")
  })

  it("rejects invalid actions", () => {
    expect(() => Permission.Action.parse("invalid")).toThrow()
  })
})

describe("Permission.fromConfig", () => {
  it("converts string values to wildcard rules", () => {
    const rules = Permission.fromConfig({ "*": "allow" })
    expect(rules).toEqual([
      { permission: "*", pattern: "*", action: "allow" },
    ])
  })

  it("converts object values to pattern rules", () => {
    const rules = Permission.fromConfig({
      read: { "*.env": "ask", "*": "allow" },
    })
    expect(rules).toHaveLength(2)
    expect(rules[0]).toEqual({ permission: "read", pattern: "*.env", action: "ask" })
    expect(rules[1]).toEqual({ permission: "read", pattern: "*", action: "allow" })
  })

  it("expands ~ to home directory", () => {
    const rules = Permission.fromConfig({
      external_directory: { "~/secret/*": "deny" },
    })
    expect(rules[0]!.pattern).not.toContain("~")
    expect(rules[0]!.pattern).toContain("secret")
  })

  it("expands $HOME to home directory", () => {
    const rules = Permission.fromConfig({
      external_directory: { "$HOME/secret/*": "deny" },
    })
    expect(rules[0]!.pattern).not.toContain("$HOME")
    expect(rules[0]!.pattern).toContain("secret")
  })
})

describe("Permission.merge", () => {
  it("merges multiple rulesets into one", () => {
    const a = [{ permission: "a", pattern: "*", action: "allow" as const }]
    const b = [{ permission: "b", pattern: "*", action: "deny" as const }]
    const merged = Permission.merge(a, b)
    expect(merged).toHaveLength(2)
    expect(merged[0]!.permission).toBe("a")
    expect(merged[1]!.permission).toBe("b")
  })

  it("merging empty arrays returns empty", () => {
    expect(Permission.merge([], [])).toEqual([])
  })
})

describe("Permission.evaluate", () => {
  it("returns matching rule", () => {
    const rules: Permission.Ruleset = [
      { permission: "*", pattern: "*", action: "allow" },
    ]
    const result = Permission.evaluate("read", "/path", rules)
    expect(result.action).toBe("allow")
  })

  it("last matching rule wins", () => {
    const rules: Permission.Ruleset = [
      { permission: "*", pattern: "*", action: "allow" },
      { permission: "read", pattern: "*.env", action: "deny" },
    ]
    const result = Permission.evaluate("read", ".env", rules)
    expect(result.action).toBe("deny")
  })

  it("defaults to ask when no rule matches", () => {
    const result = Permission.evaluate("unknown", "/path")
    expect(result.action).toBe("ask")
  })

  it("wildcard permission matches", () => {
    const rules: Permission.Ruleset = [
      { permission: "*", pattern: "*", action: "allow" },
    ]
    expect(Permission.evaluate("any_permission", "any_pattern", rules).action).toBe("allow")
  })

  it("specific rule overrides wildcard", () => {
    const rules: Permission.Ruleset = [
      { permission: "*", pattern: "*", action: "allow" },
      { permission: "bash", pattern: "*", action: "deny" },
    ]
    expect(Permission.evaluate("bash", "cmd", rules).action).toBe("deny")
    expect(Permission.evaluate("read", "file", rules).action).toBe("allow")
  })

  it("works with multiple rulesets", () => {
    const defaults: Permission.Ruleset = [
      { permission: "*", pattern: "*", action: "allow" },
    ]
    const overrides: Permission.Ruleset = [
      { permission: "write", pattern: "*", action: "deny" },
    ]
    expect(Permission.evaluate("write", "/tmp", defaults, overrides).action).toBe("deny")
    expect(Permission.evaluate("read", "/tmp", defaults, overrides).action).toBe("allow")
  })
})

describe("Permission error classes", () => {
  it("RejectedError", () => {
    const err = new Permission.RejectedError()
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toContain("rejected")
  })

  it("CorrectedError stores user message", () => {
    const err = new Permission.CorrectedError("use a different approach")
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toContain("use a different approach")
  })

  it("DeniedError stores ruleset", () => {
    const ruleset: Permission.Ruleset = [
      { permission: "bash", pattern: "*", action: "deny" },
    ]
    const err = new Permission.DeniedError(ruleset)
    expect(err).toBeInstanceOf(Error)
    expect(err.ruleset).toEqual(ruleset)
  })
})

describe("Permission.list", () => {
  it("returns array", () => {
    const pending = Permission.list()
    expect(Array.isArray(pending)).toBe(true)
  })
})

describe("Permission.reply", () => {
  it("handles non-existent requestID gracefully", () => {
    // Should not throw
    Permission.reply({ requestID: "nonexistent", reply: "once" })
  })
})
