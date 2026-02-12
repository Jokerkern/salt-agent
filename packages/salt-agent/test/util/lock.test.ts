import { describe, it, expect } from "vitest"
import { Lock } from "../../src/util/lock.js"

function tick() {
  return new Promise<void>((r) => queueMicrotask(r))
}

async function flush(n = 5) {
  for (let i = 0; i < n; i++) await tick()
}

describe("Lock", () => {
  it("writer exclusivity: blocks reads and other writes while held", async () => {
    const key = "lock:" + Math.random().toString(36).slice(2)

    const state = {
      writer2: false,
      reader: false,
      writers: 0,
    }

    // Acquire writer1
    const releaseWriter1 = await Lock.write(key)
    state.writers++
    expect(state.writers).toBe(1)

    // Start writer2 candidate (should block)
    const writer2Task = (async () => {
      const release = await Lock.write(key)
      state.writers++
      expect(state.writers).toBe(1)
      state.writer2 = true
      // Hold for a tick so reader cannot slip in
      await tick()
      return release
    })()

    // Start reader candidate (should block)
    const readerTask = (async () => {
      const release = await Lock.read(key)
      state.reader = true
      return release
    })()

    // Flush microtasks and assert neither acquired
    await flush()
    expect(state.writer2).toBe(false)
    expect(state.reader).toBe(false)

    // Release writer1
    releaseWriter1()
    state.writers--

    // writer2 should acquire next (writers are prioritized)
    const releaseWriter2 = await writer2Task
    expect(state.writer2).toBe(true)

    // Reader still blocked while writer2 held
    await flush()
    expect(state.reader).toBe(false)

    // Release writer2
    releaseWriter2()
    state.writers--

    // Reader should now acquire
    const releaseReader = await readerTask
    expect(state.reader).toBe(true)

    releaseReader()
  })

  it("multiple readers can hold simultaneously", async () => {
    const key = "lock:" + Math.random().toString(36).slice(2)

    const release1 = await Lock.read(key)
    const release2 = await Lock.read(key)

    // Both acquired without blocking
    release1()
    release2()
  })

  it("writer waits for all readers to finish", async () => {
    const key = "lock:" + Math.random().toString(36).slice(2)
    let writerAcquired = false

    const releaseReader1 = await Lock.read(key)
    const releaseReader2 = await Lock.read(key)

    // Start writer (should block)
    const writerTask = (async () => {
      const release = await Lock.write(key)
      writerAcquired = true
      return release
    })()

    await flush()
    expect(writerAcquired).toBe(false)

    // Release one reader — writer still blocked
    releaseReader1()
    await flush()
    expect(writerAcquired).toBe(false)

    // Release second reader — writer should acquire
    releaseReader2()
    const releaseWriter = await writerTask
    expect(writerAcquired).toBe(true)

    releaseWriter()
  })
})
