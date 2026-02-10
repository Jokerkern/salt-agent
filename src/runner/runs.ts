import type { RunHandle } from "./types.js";

/**
 * Track active runs per session, modeled after openclaw's ACTIVE_EMBEDDED_RUNS pattern.
 */
const ACTIVE_RUNS = new Map<string, RunHandle>();

export function setActiveRun(sessionId: string, handle: RunHandle): void {
  ACTIVE_RUNS.set(sessionId, handle);
}

export function clearActiveRun(sessionId: string, handle: RunHandle): void {
  if (ACTIVE_RUNS.get(sessionId) === handle) {
    ACTIVE_RUNS.delete(sessionId);
  }
}

export function abortRun(sessionId: string): boolean {
  const handle = ACTIVE_RUNS.get(sessionId);
  if (!handle) return false;
  handle.abort();
  return true;
}

export function isRunActive(sessionId: string): boolean {
  return ACTIVE_RUNS.has(sessionId);
}

export function isRunStreaming(sessionId: string): boolean {
  const handle = ACTIVE_RUNS.get(sessionId);
  return handle ? handle.isStreaming() : false;
}
