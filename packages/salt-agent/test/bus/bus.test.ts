import { describe, it, expect } from "vitest"
import z from "zod"
import { BusEvent } from "../../src/bus/bus-event.js"
import { Bus } from "../../src/bus/bus.js"

describe("BusEvent", () => {
  it("define creates an event definition with type and properties", () => {
    const evt = BusEvent.define("test.event", z.object({ value: z.number() }))
    expect(evt.type).toBe("test.event")
    expect(evt.properties).toBeDefined()
  })

  it("payloads returns a Zod discriminatedUnion of all registered events", () => {
    BusEvent.define("payloads.a", z.object({ a: z.string() }))
    BusEvent.define("payloads.b", z.object({ b: z.number() }))

    const schema = BusEvent.payloads()
    // Should accept valid payloads
    const result = schema.parse({ type: "payloads.a", properties: { a: "hello" } })
    expect(result.type).toBe("payloads.a")
  })
})

describe("Bus", () => {
  it("subscribe receives published events", async () => {
    const evt = BusEvent.define("bus.test.sub", z.object({ msg: z.string() }))
    const received: string[] = []

    Bus.subscribe(evt, (event) => {
      received.push(event.properties.msg)
    })

    await Bus.publish(evt, { msg: "hello" })
    await Bus.publish(evt, { msg: "world" })

    expect(received).toEqual(["hello", "world"])
  })

  it("unsubscribe stops receiving events", async () => {
    const evt = BusEvent.define("bus.test.unsub", z.object({ n: z.number() }))
    const received: number[] = []

    const unsub = Bus.subscribe(evt, (event) => {
      received.push(event.properties.n)
    })

    await Bus.publish(evt, { n: 1 })
    unsub()
    await Bus.publish(evt, { n: 2 })

    expect(received).toEqual([1])
  })

  it("subscribeAll receives all event types", async () => {
    const evtA = BusEvent.define("bus.test.all.a", z.object({ a: z.boolean() }))
    const evtB = BusEvent.define("bus.test.all.b", z.object({ b: z.boolean() }))
    const received: string[] = []

    const unsub = Bus.subscribeAll((event) => {
      received.push(event.type)
    })

    await Bus.publish(evtA, { a: true })
    await Bus.publish(evtB, { b: false })

    unsub()

    expect(received).toEqual(["bus.test.all.a", "bus.test.all.b"])
  })

  it("once unsubscribes after returning 'done'", async () => {
    const evt = BusEvent.define("bus.test.once", z.object({ n: z.number() }))
    const received: number[] = []

    Bus.once(evt, (event) => {
      received.push(event.properties.n)
      return event.properties.n >= 2 ? "done" : undefined
    })

    await Bus.publish(evt, { n: 1 })
    await Bus.publish(evt, { n: 2 })
    await Bus.publish(evt, { n: 3 })

    expect(received).toEqual([1, 2])
  })

  it("multiple subscribers for the same event all receive it", async () => {
    const evt = BusEvent.define("bus.test.multi", z.object({ x: z.number() }))
    const a: number[] = []
    const b: number[] = []

    Bus.subscribe(evt, (event) => a.push(event.properties.x))
    Bus.subscribe(evt, (event) => b.push(event.properties.x))

    await Bus.publish(evt, { x: 42 })

    expect(a).toEqual([42])
    expect(b).toEqual([42])
  })

  it("publish with no subscribers does not throw", async () => {
    const evt = BusEvent.define("bus.test.nosub", z.object({}))
    await expect(Bus.publish(evt, {})).resolves.not.toThrow()
  })

  it("subscribe to different events does not cross-fire", async () => {
    const evtX = BusEvent.define("bus.test.cross.x", z.object({ v: z.string() }))
    const evtY = BusEvent.define("bus.test.cross.y", z.object({ v: z.string() }))
    const received: string[] = []

    Bus.subscribe(evtX, (event) => {
      received.push("x:" + event.properties.v)
    })
    Bus.subscribe(evtY, (event) => {
      received.push("y:" + event.properties.v)
    })

    await Bus.publish(evtX, { v: "hello" })

    expect(received).toEqual(["x:hello"])
  })
})
