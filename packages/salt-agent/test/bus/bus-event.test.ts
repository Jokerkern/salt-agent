import { describe, it, expect } from "vitest"
import z from "zod"
import { BusEvent } from "../../src/bus/bus-event.js"

describe("BusEvent", () => {
  it("define returns an object with type and properties", () => {
    const def = BusEvent.define("test.busevent.define", z.object({ a: z.number() }))
    expect(def.type).toBe("test.busevent.define")
    expect(def.properties).toBeDefined()
  })

  it("define registers event in internal registry", () => {
    BusEvent.define("test.busevent.reg1", z.object({ x: z.string() }))
    BusEvent.define("test.busevent.reg2", z.object({ y: z.boolean() }))

    const schema = BusEvent.payloads()
    // Should accept both event types
    const r1 = schema.parse({ type: "test.busevent.reg1", properties: { x: "hi" } })
    expect(r1.type).toBe("test.busevent.reg1")

    const r2 = schema.parse({ type: "test.busevent.reg2", properties: { y: true } })
    expect(r2.type).toBe("test.busevent.reg2")
  })

  it("payloads schema rejects unknown event types", () => {
    expect(() =>
      BusEvent.payloads().parse({ type: "nonexistent.event", properties: {} }),
    ).toThrow()
  })

  it("payloads schema validates properties", () => {
    BusEvent.define("test.busevent.validate", z.object({ count: z.number() }))
    expect(() =>
      BusEvent.payloads().parse({
        type: "test.busevent.validate",
        properties: { count: "not a number" },
      }),
    ).toThrow()
  })

  it("multiple defines with same type overwrites in registry", () => {
    BusEvent.define("test.busevent.overwrite", z.object({ v1: z.string() }))
    BusEvent.define("test.busevent.overwrite", z.object({ v2: z.number() }))

    const schema = BusEvent.payloads()
    // The last definition should win
    const result = schema.parse({
      type: "test.busevent.overwrite",
      properties: { v2: 42 },
    })
    expect(result.type).toBe("test.busevent.overwrite")
  })
})
