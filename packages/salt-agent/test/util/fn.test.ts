import { describe, it, expect } from "vitest"
import z from "zod"
import { fn } from "../../src/util/fn.js"

describe("fn", () => {
  it("parses input with Zod schema before calling callback", () => {
    const add = fn(
      z.object({ a: z.number(), b: z.number() }),
      (input) => input.a + input.b,
    )
    expect(add({ a: 1, b: 2 })).toBe(3)
  })

  it("strips extra properties via Zod parse", () => {
    const schema = z.object({ name: z.string() })
    const getName = fn(schema, (input) => input.name)
    // @ts-expect-error extra property
    expect(getName({ name: "hello", extra: true })).toBe("hello")
  })

  it("throws on invalid input", () => {
    const numOnly = fn(z.number(), (n) => n * 2)
    expect(() => numOnly("not a number" as any)).toThrow()
  })

  it("coerces compatible types", () => {
    const coerced = fn(z.coerce.number(), (n) => n + 1)
    expect(coerced("42" as any)).toBe(43)
  })

  it(".force() skips validation", () => {
    const strict = fn(z.number().min(10), (n) => n)
    // Normal call should throw
    expect(() => strict(5)).toThrow()
    // .force() bypasses Zod
    expect(strict.force(5)).toBe(5)
  })

  it(".schema exposes the Zod schema", () => {
    const schema = z.string().email()
    const validate = fn(schema, (s) => s)
    expect(validate.schema).toBe(schema)
  })

  it("works with async callbacks", async () => {
    const asyncFn = fn(z.string(), async (s) => {
      return s.toUpperCase()
    })
    const result = await asyncFn("hello")
    expect(result).toBe("HELLO")
  })
})
