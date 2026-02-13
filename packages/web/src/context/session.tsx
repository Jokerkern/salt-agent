import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  type ReactNode,
  type Dispatch,
} from "react"
import { api } from "../lib/api"
import { useSSE } from "./sse"
import type {
  SessionInfo,
  MessageWithParts,
  MessageInfo,
  MessagePart,
  PermissionRequest,
  PermissionReply,
  QuestionRequest,
  SSEEvent,
} from "../lib/types"

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface SessionState {
  /** All loaded sessions, sorted newest first */
  sessions: SessionInfo[]
  /** Currently active session ID */
  activeID: string | null
  /** Messages for the active session */
  messages: MessageWithParts[]
  /** Parts indexed by messageID for quick lookup & SSE updates */
  parts: Record<string, MessagePart[]>
  /** Pending permission requests for active session */
  permissions: PermissionRequest[]
  /** Pending question requests for active session */
  questions: QuestionRequest[]
  /** Loading state */
  loading: boolean
}

const initial: SessionState = {
  sessions: [],
  activeID: null,
  messages: [],
  parts: {},
  permissions: [],
  questions: [],
  loading: false,
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type Action =
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_SESSIONS"; sessions: SessionInfo[] }
  | { type: "SESSION_CREATED"; info: SessionInfo }
  | { type: "SESSION_UPDATED"; info: SessionInfo }
  | { type: "SESSION_DELETED"; info: SessionInfo }
  | { type: "SET_ACTIVE"; id: string | null }
  | { type: "SET_MESSAGES"; messages: MessageWithParts[] }
  | { type: "MESSAGE_UPDATED"; info: MessageInfo }
  | { type: "MESSAGE_REMOVED"; sessionID: string; messageID: string }
  | { type: "PART_UPDATED"; part: MessagePart; delta?: string }
  | { type: "PART_REMOVED"; sessionID: string; messageID: string; partID: string }
  | { type: "PERMISSION_ASKED"; request: PermissionRequest }
  | { type: "PERMISSION_REPLIED"; sessionID: string; requestID: string }
  | { type: "QUESTION_ASKED"; request: QuestionRequest }
  | { type: "QUESTION_ANSWERED"; id: string; sessionID: string }

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.loading }

    case "SET_SESSIONS":
      return { ...state, sessions: action.sessions }

    case "SESSION_CREATED": {
      // Deduplicate — SSE and local dispatch may both fire
      if (state.sessions.some((s) => s.id === action.info.id)) return state
      return {
        ...state,
        sessions: [action.info, ...state.sessions],
      }
    }

    case "SESSION_UPDATED":
      return {
        ...state,
        sessions: state.sessions.map((s) => (s.id === action.info.id ? action.info : s)),
      }

    case "SESSION_DELETED":
      return {
        ...state,
        sessions: state.sessions.filter((s) => s.id !== action.info.id),
        activeID: state.activeID === action.info.id ? null : state.activeID,
        messages: state.activeID === action.info.id ? [] : state.messages,
        parts: state.activeID === action.info.id ? {} : state.parts,
      }

    case "SET_ACTIVE":
      return {
        ...state,
        activeID: action.id,
        messages: [],
        parts: {},
        permissions: [],
        questions: [],
      }

    case "SET_MESSAGES": {
      const parts: Record<string, MessagePart[]> = {}
      for (const msg of action.messages) {
        parts[msg.info.id] = msg.parts
      }
      return { ...state, messages: action.messages, parts }
    }

    case "MESSAGE_UPDATED": {
      if (action.info.sessionID !== state.activeID) return state
      const existing = state.messages.findIndex((m) => m.info.id === action.info.id)
      if (existing >= 0) {
        const updated = [...state.messages]
        updated[existing] = { ...updated[existing]!, info: action.info }
        return { ...state, messages: updated }
      }
      // New message — add to end
      return {
        ...state,
        messages: [...state.messages, { info: action.info, parts: [] }],
        parts: { ...state.parts, [action.info.id]: [] },
      }
    }

    case "MESSAGE_REMOVED": {
      if (action.sessionID !== state.activeID) return state
      const { [action.messageID]: _removed, ...restParts } = state.parts
      return {
        ...state,
        messages: state.messages.filter((m) => m.info.id !== action.messageID),
        parts: restParts,
      }
    }

    case "PART_UPDATED": {
      if (action.part.sessionID !== state.activeID) return state
      const msgID = action.part.messageID
      const existing = state.parts[msgID] ?? []
      const idx = existing.findIndex((p) => p.id === action.part.id)

      let updated: MessagePart[]
      if (idx >= 0) {
        updated = [...existing]
        updated[idx] = action.part
      } else {
        updated = [...existing, action.part]
      }

      return {
        ...state,
        parts: { ...state.parts, [msgID]: updated },
      }
    }

    case "PART_REMOVED": {
      if (action.sessionID !== state.activeID) return state
      const msgParts = state.parts[action.messageID]
      if (!msgParts) return state
      return {
        ...state,
        parts: {
          ...state.parts,
          [action.messageID]: msgParts.filter((p) => p.id !== action.partID),
        },
      }
    }

    case "PERMISSION_ASKED": {
      if (action.request.sessionID !== state.activeID) return state
      return {
        ...state,
        permissions: [...state.permissions, action.request],
      }
    }

    case "PERMISSION_REPLIED": {
      if (action.sessionID !== state.activeID) return state
      return {
        ...state,
        permissions: state.permissions.filter((p) => p.id !== action.requestID),
      }
    }

    case "QUESTION_ASKED": {
      if (action.request.sessionID !== state.activeID) return state
      return {
        ...state,
        questions: [...state.questions, action.request],
      }
    }

    case "QUESTION_ANSWERED": {
      if (action.sessionID !== state.activeID) return state
      return {
        ...state,
        questions: state.questions.filter((q) => q.id !== action.id),
      }
    }

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface SessionContextValue {
  state: SessionState
  dispatch: Dispatch<Action>
  loadSessions: () => Promise<void>
  loadMessages: (sessionID: string) => Promise<void>
  createSession: (title?: string) => Promise<SessionInfo>
  deleteSession: (id: string) => Promise<void>
  setActive: (id: string | null) => void
  sendMessage: (text: string) => Promise<void>
  abortSession: (id: string) => Promise<void>
  replyPermission: (id: string, reply: PermissionReply) => Promise<void>
  replyQuestion: (id: string, answers: string[][]) => Promise<void>
  rejectQuestion: (id: string) => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const { subscribe } = useSSE()

  // ---------------------------------------------------------------------------
  // SSE event handler
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return subscribe((event: SSEEvent) => {
      switch (event.type) {
        case "session.created":
          dispatch({ type: "SESSION_CREATED", info: event.properties.info })
          break
        case "session.updated":
          dispatch({ type: "SESSION_UPDATED", info: event.properties.info })
          break
        case "session.deleted":
          dispatch({ type: "SESSION_DELETED", info: event.properties.info })
          break
        case "message.updated":
          dispatch({ type: "MESSAGE_UPDATED", info: event.properties.info })
          break
        case "message.removed":
          dispatch({
            type: "MESSAGE_REMOVED",
            sessionID: event.properties.sessionID,
            messageID: event.properties.messageID,
          })
          break
        case "message.part.updated":
          dispatch({ type: "PART_UPDATED", part: event.properties.part, delta: event.properties.delta })
          break
        case "message.part.removed":
          dispatch({
            type: "PART_REMOVED",
            sessionID: event.properties.sessionID,
            messageID: event.properties.messageID,
            partID: event.properties.partID,
          })
          break
        case "permission.asked":
          dispatch({ type: "PERMISSION_ASKED", request: event.properties })
          break
        case "permission.replied":
          dispatch({
            type: "PERMISSION_REPLIED",
            sessionID: event.properties.sessionID,
            requestID: event.properties.requestID,
          })
          break
        case "question.asked":
          dispatch({ type: "QUESTION_ASKED", request: event.properties })
          break
        case "question.answered":
          dispatch({
            type: "QUESTION_ANSWERED",
            id: event.properties.id,
            sessionID: event.properties.sessionID,
          })
          break
      }
    })
  }, [subscribe])

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const loadSessions = useCallback(async () => {
    dispatch({ type: "SET_LOADING", loading: true })
    try {
      const sessions = await api.session.list({ roots: true })
      dispatch({ type: "SET_SESSIONS", sessions })
    } finally {
      dispatch({ type: "SET_LOADING", loading: false })
    }
  }, [])

  const loadMessages = useCallback(async (sessionID: string) => {
    const messages = await api.session.messages(sessionID)
    // API returns newest first, we want oldest first
    messages.reverse()
    dispatch({ type: "SET_MESSAGES", messages })
  }, [])

  const createSession = useCallback(async (title?: string) => {
    const session = await api.session.create(title ? { title } : undefined)
    // Immediately add to local state (SSE will also fire but dedupe handles it)
    dispatch({ type: "SESSION_CREATED", info: session })
    return session
  }, [])

  const deleteSession = useCallback(async (id: string) => {
    await api.session.delete(id)
    // Immediately remove from local state
    dispatch({ type: "SESSION_DELETED", info: { id } as SessionInfo })
  }, [])

  const setActive = useCallback(
    (id: string | null) => {
      dispatch({ type: "SET_ACTIVE", id })
      if (id) {
        loadMessages(id)
      }
    },
    [loadMessages],
  )

  const sendMessage = useCallback(
    async (text: string) => {
      if (!state.activeID) return
      await api.session.sendAsync(state.activeID, {
        parts: [{ type: "text", text }],
      })
    },
    [state.activeID],
  )

  const abortSession = useCallback(async (id: string) => {
    await api.session.abort(id)
  }, [])

  const replyPermission = useCallback(async (id: string, reply: PermissionReply) => {
    await api.permission.reply(id, { reply })
  }, [])

  const replyQuestion = useCallback(async (id: string, answers: string[][]) => {
    await api.question.reply(id, { answers })
  }, [])

  const rejectQuestion = useCallback(async (id: string) => {
    await api.question.reject(id)
  }, [])

  return (
    <SessionContext.Provider
      value={{
        state,
        dispatch,
        loadSessions,
        loadMessages,
        createSession,
        deleteSession,
        setActive,
        sendMessage,
        abortSession,
        replyPermission,
        replyQuestion,
        rejectQuestion,
      }}
    >
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error("useSession must be used within SessionProvider")
  return ctx
}
