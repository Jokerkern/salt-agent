import z from "zod"
import { BusEvent } from "../bus/bus-event.js"
import { Bus } from "../bus/bus.js"

export namespace SessionStatus {
  export const Info = z.union([
    z.object({ type: z.literal("idle") }),
    z.object({
      type: z.literal("retry"),
      attempt: z.number(),
      message: z.string(),
      next: z.number(),
    }),
    z.object({ type: z.literal("busy") }),
  ])
  export type Info = z.infer<typeof Info>

  export const Event = {
    Status: BusEvent.define(
      "session.status",
      z.object({
        sessionID: z.string(),
        status: Info,
      }),
    ),
  }

  const data: Record<string, Info> = {}

  export function get(sessionID: string): Info {
    return data[sessionID] ?? { type: "idle" }
  }

  export function list(): Record<string, Info> {
    return data
  }

  export function set(sessionID: string, status: Info) {
    Bus.publish(Event.Status, { sessionID, status })
    if (status.type === "idle") {
      delete data[sessionID]
      return
    }
    data[sessionID] = status
  }
}
