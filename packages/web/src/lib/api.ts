import type {
  SessionInfo,
  MessageWithParts,
  ProviderListResponse,
  ConfigInfo,
  PermissionRequest,
  PermissionReply,
  AuthInfo,
  AgentInfo,
  PromptInput,
} from "./types"

// ---------------------------------------------------------------------------
// Base helpers
// ---------------------------------------------------------------------------

// Dev mode: Vite proxy at /api -> backend; Production: same origin, no prefix
const BASE = import.meta.env.DEV ? "/api" : ""

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new ApiError(res.status, text)
  }
  return res.json() as Promise<T>
}

function get<T>(path: string) {
  return request<T>(path)
}

function post<T>(path: string, body?: unknown) {
  return request<T>(path, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function patch<T>(path: string, body: unknown) {
  return request<T>(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

function put<T>(path: string, body: unknown) {
  return request<T>(path, {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

function del<T>(path: string) {
  return request<T>(path, { method: "DELETE" })
}

// ---------------------------------------------------------------------------
// API namespace
// ---------------------------------------------------------------------------

export const api = {
  session: {
    list: (opts?: { search?: string; limit?: number; roots?: boolean }) => {
      const params = new URLSearchParams()
      if (opts?.search) params.set("search", opts.search)
      if (opts?.limit) params.set("limit", String(opts.limit))
      if (opts?.roots) params.set("roots", "true")
      const qs = params.toString()
      return get<SessionInfo[]>(`/session${qs ? `?${qs}` : ""}`)
    },
    get: (id: string) => get<SessionInfo>(`/session/${id}`),
    create: (body?: { title?: string; parentID?: string }) => post<SessionInfo>("/session", body),
    update: (id: string, body: { title?: string }) => patch<SessionInfo>(`/session/${id}`, body),
    delete: (id: string) => del<boolean>(`/session/${id}`),
    abort: (id: string) => post<boolean>(`/session/${id}/abort`),
    messages: (id: string, opts?: { limit?: number }) => {
      const params = new URLSearchParams()
      if (opts?.limit) params.set("limit", String(opts.limit))
      const qs = params.toString()
      return get<MessageWithParts[]>(`/session/${id}/message${qs ? `?${qs}` : ""}`)
    },
    message: (sessionID: string, messageID: string) =>
      get<MessageWithParts>(`/session/${sessionID}/message/${messageID}`),
    send: (id: string, body: PromptInput) => post<MessageWithParts>(`/session/${id}/message`, body),
    sendAsync: (id: string, body: PromptInput) => post<void>(`/session/${id}/prompt_async`, body),
  },
  provider: {
    list: () => get<ProviderListResponse>("/provider"),
    auth: () => get<Record<string, Array<{ type: string; env?: string[] }>>>("/provider/auth"),
  },
  auth: {
    set: (providerID: string, info: AuthInfo) => put<boolean>(`/auth/${providerID}`, info),
    delete: (providerID: string) => del<boolean>(`/auth/${providerID}`),
  },
  config: {
    get: () => get<ConfigInfo>("/config"),
    update: (body: Partial<ConfigInfo>) => patch<ConfigInfo>("/config", body),
  },
  permission: {
    list: () => get<PermissionRequest[]>("/permission"),
    reply: (id: string, body: { reply: PermissionReply; message?: string }) =>
      post<boolean>(`/permission/${id}/reply`, body),
  },
  question: {
    reply: (id: string, body: { answers: string[][] }) => post<boolean>(`/question/${id}/reply`, body),
    reject: (id: string) => post<boolean>(`/question/${id}/reject`),
  },
  agent: {
    list: () => get<AgentInfo[]>("/agent"),
  },
  path: () =>
    get<{
      data: string
      config: string
      storage: string
      directory: string
      worktree: string
    }>("/path"),
  health: () => get<{ status: string }>("/health"),
}
