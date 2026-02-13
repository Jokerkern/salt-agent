import { describe, it, expect } from "vitest"
import { abortAfterAny } from "../../src/util/abort.js"

describe("abortAfterAny", () => {
  it("returns an AbortSignal and clearTimeout function", () => {
    const result = abortAfterAny(10000)
    expect(result.signal).toBeInstanceOf(AbortSignal)
    expect(typeof result.clearTimeout).toBe("function")
    result.clearTimeout()
  })

  it("aborts when timeout expires", async () => {
    const result = abortAfterAny(50)
    expect(result.signal.aborted).toBe(false)
    await new Promise((r) => setTimeout(r, 100))
    expect(result.signal.aborted).toBe(true)
  })

  it("aborts immediately if passed signal is already aborted", () => {
    const controller = new AbortController()
    controller.abort()
    const result = abortAfterAny(10000, controller.signal)
    expect(result.signal.aborted).toBe(true)
    result.clearTimeout()
  })

  it("aborts when external signal fires", () => {
    const controller = new AbortController()
    const result = abortAfterAny(10000, controller.signal)
    expect(result.signal.aborted).toBe(false)
    controller.abort()
    expect(result.signal.aborted).toBe(true)
    result.clearTimeout()
  })

  it("aborts when any of multiple signals fire", () => {
    const c1 = new AbortController()
    const c2 = new AbortController()
    const result = abortAfterAny(10000, c1.signal, c2.signal)
    expect(result.signal.aborted).toBe(false)
    c2.abort()
    expect(result.signal.aborted).toBe(true)
    result.clearTimeout()
  })

  it("clearTimeout prevents timeout abort", async () => {
    const result = abortAfterAny(50)
    result.clearTimeout()
    await new Promise((r) => setTimeout(r, 100))
    // Without the external signal triggering, it should NOT be aborted
    // since we cleared the timeout. However the signal might still be
    // not aborted because nothing else triggered it.
    expect(result.signal.aborted).toBe(false)
  })
})
