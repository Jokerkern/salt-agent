/**
 * Creates an AbortSignal that fires when either the timeout expires
 * or any of the provided signals abort.
 */
export function abortAfterAny(
  timeout: number,
  ...signals: AbortSignal[]
): { signal: AbortSignal; clearTimeout: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error("Timeout")), timeout)

  function abort() {
    controller.abort()
    clearTimeout(timer)
  }

  for (const signal of signals) {
    if (signal.aborted) {
      abort()
      break
    }
    signal.addEventListener("abort", abort, { once: true })
  }

  return {
    signal: controller.signal,
    clearTimeout: () => clearTimeout(timer),
  }
}
