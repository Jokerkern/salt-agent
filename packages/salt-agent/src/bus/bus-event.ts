import z from "zod"
import type { ZodType } from "zod"

export namespace BusEvent {

  export type Definition = ReturnType<typeof define>

  const registry = new Map<string, Definition>()

  export function define<Type extends string, Properties extends ZodType>(type: Type, properties: Properties) {
    const result = {
      type,
      properties,
    }
    registry.set(type, result)
    return result
  }

  /** Build a discriminatedUnion of all registered events (useful for API schema generation) */
  export function payloads() {
    return z
      .discriminatedUnion(
        "type",
        Array.from(registry.values()).map((def) =>
          z.object({
            type: z.literal(def.type),
            properties: def.properties,
          }),
        ) as any,
      )
  }
}
