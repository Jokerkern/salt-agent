import type { SSEEvent } from "./types"

export type SSEHandler = (event: SSEEvent) => void

/**
 * Manages an EventSource connection to the server's /api/event endpoint.
 * Features: auto-reconnect with exponential backoff, heartbeat detection.
 */
export function createSSEConnection(handler: SSEHandler) {
  let es: EventSource | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null
  let backoff = 1000
  let disposed = false

  const HEARTBEAT_TIMEOUT = 45_000 // 45s (server sends every 30s)
  const MAX_BACKOFF = 30_000

  function resetHeartbeat() {
    if (heartbeatTimer) clearTimeout(heartbeatTimer)
    heartbeatTimer = setTimeout(() => {
      // No heartbeat received — reconnect
      console.warn("[SSE] heartbeat timeout, reconnecting...")
      reconnect()
    }, HEARTBEAT_TIMEOUT)
  }

  function connect() {
    if (disposed) return
    if (es) {
      es.close()
      es = null
    }

    const url = import.meta.env.DEV ? "/api/event" : "/event"
    es = new EventSource(url)

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as SSEEvent
        resetHeartbeat()
        handler(data)
      } catch {
        // ignore parse errors
      }
    }

    es.onopen = () => {
      backoff = 1000
      resetHeartbeat()
    }

    es.onerror = () => {
      reconnect()
    }
  }

  function reconnect() {
    if (disposed) return
    if (es) {
      es.close()
      es = null
    }
    if (heartbeatTimer) {
      clearTimeout(heartbeatTimer)
      heartbeatTimer = null
    }
    if (reconnectTimer) return // already scheduled

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, backoff)

    backoff = Math.min(backoff * 2, MAX_BACKOFF)
  }

  function dispose() {
    disposed = true
    if (es) {
      es.close()
      es = null
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (heartbeatTimer) {
      clearTimeout(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  // Start immediately
  connect()

  return { dispose }
}
