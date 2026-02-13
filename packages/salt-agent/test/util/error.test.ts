import { describe, it, expect } from "vitest"
import z from "zod"
import { NamedError } from "../../src/util/error.js"

describe("NamedError", () => {
  it("create produces a class with correct name", () => {
    const TestError = NamedError.create("TestError", z.object({ code: z.number() }))
    expect(TestError.name).toBe("TestError")
  })

  it("instances have correct name and data", () => {
    const MyError = NamedError.create("MyError", z.object({ msg: z.string() }))
    const err = new MyError({ msg: "hello" })
    expect(err.name).toBe("MyError")
    expect(err.data.msg).toBe("hello")
    expect(err.message).toBe("MyError")
  })

  it("isInstance correctly identifies instances", () => {
    const ErrA = NamedError.create("ErrA", z.object({ x: z.number() }))
    const ErrB = NamedError.create("ErrB", z.object({ y: z.string() }))

    const a = new ErrA({ x: 1 })
    expect(ErrA.isInstance(a)).toBe(true)
    expect(ErrB.isInstance(a)).toBe(false)
  })

  it("isInstance works on plain objects with matching name", () => {
    const ErrC = NamedError.create("ErrC", z.object({}))
    expect(ErrC.isInstance({ name: "ErrC" })).toBe(true)
    expect(ErrC.isInstance({ name: "Other" })).toBe(false)
  })

  it("isInstance returns false for non-objects", () => {
    const Err = NamedError.create("Err", z.object({}))
    expect(Err.isInstance(null)).toBe(false)
    expect(Err.isInstance(undefined)).toBe(false)
    expect(Err.isInstance("string")).toBe(false)
    expect(Err.isInstance(42)).toBe(false)
  })

  it("toObject returns serializable representation", () => {
    const Err = NamedError.create("SerializeError", z.object({ detail: z.string() }))
    const err = new Err({ detail: "something" })
    const obj = err.toObject()
    expect(obj).toEqual({
      name: "SerializeError",
      data: { detail: "something" },
    })
  })

  it("Schema is a valid Zod schema", () => {
    const Err = NamedError.create("SchemaError", z.object({ n: z.number() }))
    const result = Err.Schema.parse({ name: "SchemaError", data: { n: 42 } })
    expect(result.name).toBe("SchemaError")
    expect(result.data.n).toBe(42)
  })

  it("Schema rejects wrong name", () => {
    const Err = NamedError.create("CorrectName", z.object({}))
    expect(() => Err.Schema.parse({ name: "WrongName", data: {} })).toThrow()
  })

  it("extends Error", () => {
    const Err = NamedError.create("ExtTest", z.object({}))
    const err = new Err({})
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(NamedError)
  })

  it("supports ErrorOptions (cause)", () => {
    const Err = NamedError.create("CauseTest", z.object({}))
    const cause = new Error("root cause")
    const err = new Err({}, { cause })
    expect(err.cause).toBe(cause)
  })

  it("Unknown error is pre-defined", () => {
    const err = new NamedError.Unknown({ message: "oops" })
    expect(err.name).toBe("UnknownError")
    expect(err.data.message).toBe("oops")
    expect(NamedError.Unknown.isInstance(err)).toBe(true)
  })
})
