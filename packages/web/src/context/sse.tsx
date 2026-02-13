import { createContext, useContext, useEffect, useRef, useCallback, type ReactNode } from "react"
import { createSSEConnection, type SSEHandler } from "../lib/sse"
import type { SSEEvent } from "../lib/types"

// ---------------------------------------------------------------------------
// SSE Context — distributes server events to subscribers
// ---------------------------------------------------------------------------

type Listener = (event: SSEEvent) => void

interface SSEContextValue {
  subscribe: (listener: Listener) => () => void
}

const SSEContext = createContext<SSEContextValue | null>(null)

export function SSEProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Set<Listener>())

  const handler: SSEHandler = useCallback((event: SSEEvent) => {
    for (const fn of listeners.current) {
      fn(event)
    }
  }, [])

  useEffect(() => {
    const conn = createSSEConnection(handler)
    return () => conn.dispose()
  }, [handler])

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener)
    return () => {
      listeners.current.delete(listener)
    }
  }, [])

  return <SSEContext.Provider value={{ subscribe }}>{children}</SSEContext.Provider>
}

export function useSSE() {
  const ctx = useContext(SSEContext)
  if (!ctx) throw new Error("useSSE must be used within SSEProvider")
  return ctx
}

/**
 * Hook to subscribe to specific SSE event types.
 * The handler is stable across re-renders via ref.
 */
export function useSSEEvent<T extends SSEEvent["type"]>(
  type: T,
  handler: (event: Extract<SSEEvent, { type: T }>) => void,
) {
  const ref = useRef(handler)
  ref.current = handler

  const { subscribe } = useSSE()

  useEffect(() => {
    return subscribe((event) => {
      if (event.type === type) {
        ref.current(event as Extract<SSEEvent, { type: T }>)
      }
    })
  }, [subscribe, type])
}
