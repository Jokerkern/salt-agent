import { randomBytes } from "crypto"
import z from "zod"

export namespace Identifier {
  const prefixes = {
    session: "ses",
    message: "msg",
    part: "prt",
    permission: "prm",
    tool: "tol",
    question: "qst",
  } as const

  export type Prefix = keyof typeof prefixes

  export function schema(prefix: Prefix) {
    return z.string().startsWith(prefixes[prefix])
  }

  const ID_RANDOM_LENGTH = 14

  // State for monotonic ID generation
  let lastTimestamp = 0
  let counter = 0

  export function ascending(prefix: Prefix, given?: string) {
    return generate(prefix, false, given)
  }

  export function descending(prefix: Prefix, given?: string) {
    return generate(prefix, true, given)
  }

  function generate(prefix: Prefix, descending: boolean, given?: string): string {
    if (given) {
      if (!given.startsWith(prefixes[prefix])) {
        throw new Error(`ID ${given} does not start with ${prefixes[prefix]}`)
      }
      return given
    }
    return create(prefix, descending)
  }

  function randomBase62(length: number): string {
    const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    const bytes = randomBytes(length)
    let result = ""
    for (let i = 0; i < length; i++) {
      result += chars[bytes[i]! % 62]
    }
    return result
  }

  function create(prefix: Prefix, descending: boolean): string {
    const now = Date.now()

    if (now !== lastTimestamp) {
      lastTimestamp = now
      counter = 0
    }
    counter++

    let encoded = BigInt(now) * BigInt(0x1000) + BigInt(counter)
    if (descending) {
      encoded = ~encoded
    }

    const timeBytes = Buffer.alloc(6)
    for (let i = 0; i < 6; i++) {
      timeBytes[i] = Number((encoded >> BigInt(40 - 8 * i)) & BigInt(0xff))
    }

    return prefixes[prefix] + "_" + timeBytes.toString("hex") + randomBase62(ID_RANDOM_LENGTH)
  }

  /** Extract timestamp from an ascending ID. Does not work with descending IDs. */
  export function timestamp(id: string): number {
    const prefix = id.split("_")[0]!
    const hex = id.slice(prefix.length + 1, prefix.length + 13)
    const encoded = BigInt("0x" + hex)
    return Number(encoded / BigInt(0x1000))
  }
}
