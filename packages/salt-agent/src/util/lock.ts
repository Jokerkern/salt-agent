export namespace Lock {
  const locks = new Map<
    string,
    {
      readers: number
      writer: boolean
      waitingReaders: (() => void)[]
      waitingWriters: (() => void)[]
    }
  >()

  function get(key: string) {
    if (!locks.has(key)) {
      locks.set(key, {
        readers: 0,
        writer: false,
        waitingReaders: [],
        waitingWriters: [],
      })
    }
    return locks.get(key)!
  }

  function process(key: string) {
    const lock = locks.get(key)
    if (!lock || lock.writer || lock.readers > 0) return

    // Prioritize writers to prevent starvation
    if (lock.waitingWriters.length > 0) {
      const nextWriter = lock.waitingWriters.shift()!
      nextWriter()
      return
    }

    // Wake up all waiting readers
    while (lock.waitingReaders.length > 0) {
      const nextReader = lock.waitingReaders.shift()!
      nextReader()
    }

    // Clean up empty locks
    if (
      lock.readers === 0 &&
      !lock.writer &&
      lock.waitingReaders.length === 0 &&
      lock.waitingWriters.length === 0
    ) {
      locks.delete(key)
    }
  }

  export async function read(key: string): Promise<() => void> {
    const lock = get(key)

    return new Promise((resolve) => {
      const release = () => {
        lock.readers--
        process(key)
      }

      if (!lock.writer && lock.waitingWriters.length === 0) {
        lock.readers++
        resolve(release)
      } else {
        lock.waitingReaders.push(() => {
          lock.readers++
          resolve(release)
        })
      }
    })
  }

  export async function write(key: string): Promise<() => void> {
    const lock = get(key)

    return new Promise((resolve) => {
      const release = () => {
        lock.writer = false
        process(key)
      }

      if (!lock.writer && lock.readers === 0) {
        lock.writer = true
        resolve(release)
      } else {
        lock.waitingWriters.push(() => {
          lock.writer = true
          resolve(release)
        })
      }
    })
  }
}
