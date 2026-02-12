import { useState, useEffect, useRef, useCallback } from 'react';
import { getSession, sendMessage, createSSE } from '../lib/api';
import type { MessageInfo, ContentBlock, AgentEvent } from '../types';

/**
 * Streaming assistant message being built up from SSE events.
 * This is a temporary UI-only structure that gets finalized
 * once the stream completes and the persisted message is loaded.
 */
interface StreamingAssistant {
  currentText: string;
  currentReasoning: string;
  blocks: ContentBlock[];
}

function buildMessageFromStream(s: StreamingAssistant): MessageInfo {
  const blocks: ContentBlock[] = [...s.blocks];
  // Append current streaming reasoning (if any) as a reasoning block
  if (s.currentReasoning) {
    blocks.push({ type: 'reasoning', text: s.currentReasoning });
  }
  // Append current streaming text (if any) as a text block
  if (s.currentText) {
    blocks.push({ type: 'text', text: s.currentText });
  }
  return {
    id: '__streaming__',
    sessionId: '',
    role: 'assistant',
    content: blocks,
    tokensInput: 0,
    tokensOutput: 0,
    cost: 0,
    createdAt: Date.now(),
  };
}

export function useChat(sessionId: string | null, onSessionCreated?: (id: string) => void) {
  const [messages, setMessages] = useState<MessageInfo[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedInput, setLastFailedInput] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const currentSessionIdRef = useRef<string | null>(sessionId);
  const skipNextLoadRef = useRef(false);
  const streamingRef = useRef<StreamingAssistant | null>(null);

  useEffect(() => {
    currentSessionIdRef.current = sessionId;
  }, [sessionId]);

  // Load session messages when session changes
  useEffect(() => {
    if (sessionId) {
      if (skipNextLoadRef.current) {
        skipNextLoadRef.current = false;
        return;
      }
      setLoading(true);
      getSession(sessionId)
        .then((data) => {
          setMessages(data.messages);
        })
        .catch((err) => {
          console.error('Failed to load session:', err);
          setMessages([]);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setMessages([]);
    }
  }, [sessionId]);

  const updateStreamingMessage = useCallback(() => {
    if (!streamingRef.current) return;
    const msg = buildMessageFromStream(streamingRef.current);
    setMessages((prev) => {
      // Replace the last message if it's our streaming placeholder
      const last = prev[prev.length - 1];
      if (last && last.id === '__streaming__') {
        return [...prev.slice(0, -1), msg];
      }
      return [...prev, msg];
    });
  }, []);

  const send = useCallback(async (text: string) => {
    if (isStreaming) return;

    try {
      setIsStreaming(true);
      setError(null);
      setLastFailedInput(null);

      // Add optimistic user message
      const userMsg: MessageInfo = {
        id: '__user_pending__',
        sessionId: currentSessionIdRef.current ?? '',
        role: 'user',
        content: [{ type: 'text', text }],
        tokensInput: 0,
        tokensOutput: 0,
        cost: 0,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // Get or create session
      const result = await sendMessage(text, currentSessionIdRef.current || undefined);
      const sid = result.session_id;

      if (sid && sid !== currentSessionIdRef.current) {
        currentSessionIdRef.current = sid;
        skipNextLoadRef.current = true;
        onSessionCreated?.(sid);
      }

      // Connect SSE
      const es = createSSE(currentSessionIdRef.current || sid, text);
      eventSourceRef.current = es;

      // Initialize streaming state
      streamingRef.current = { currentText: '', currentReasoning: '', blocks: [] };

      // --- Event handlers ---

      const handleTextStart = () => {
        if (streamingRef.current) {
          streamingRef.current.currentText = '';
        }
      };

      const handleReasoningStart = () => {
        if (streamingRef.current) {
          streamingRef.current.currentReasoning = '';
        }
      };

      const handleReasoningDelta = (e: MessageEvent) => {
        const event: AgentEvent = JSON.parse(e.data);
        if (event.type === 'reasoning-delta' && streamingRef.current) {
          streamingRef.current.currentReasoning += event.delta;
          updateStreamingMessage();
        }
      };

      const handleReasoningEnd = (e: MessageEvent) => {
        const event: AgentEvent = JSON.parse(e.data);
        if (event.type === 'reasoning-end' && streamingRef.current) {
          streamingRef.current.blocks.push({ type: 'reasoning', text: event.text });
          streamingRef.current.currentReasoning = '';
          updateStreamingMessage();
        }
      };

      const handleTextDelta = (e: MessageEvent) => {
        const event: AgentEvent = JSON.parse(e.data);
        if (event.type === 'text-delta' && streamingRef.current) {
          streamingRef.current.currentText += event.delta;
          updateStreamingMessage();
        }
      };

      const handleTextEnd = (e: MessageEvent) => {
        const event: AgentEvent = JSON.parse(e.data);
        if (event.type === 'text-end' && streamingRef.current) {
          streamingRef.current.blocks.push({ type: 'text', text: event.text });
          streamingRef.current.currentText = '';
          updateStreamingMessage();
        }
      };

      const handleToolCallStart = (e: MessageEvent) => {
        const event: AgentEvent = JSON.parse(e.data);
        if (event.type === 'tool-call-start' && streamingRef.current) {
          // Add placeholder tool-call block
          streamingRef.current.blocks.push({
            type: 'tool-call',
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: undefined,
          });
          updateStreamingMessage();
        }
      };

      const handleToolCallArgs = (e: MessageEvent) => {
        const event: AgentEvent = JSON.parse(e.data);
        if (event.type === 'tool-call-args' && streamingRef.current) {
          // Update the existing tool-call block with args
          const blocks = streamingRef.current.blocks;
          const idx = blocks.findIndex(
            (b) => b.type === 'tool-call' && b.toolCallId === event.toolCallId
          );
          if (idx !== -1) {
            blocks[idx] = {
              type: 'tool-call',
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              args: event.args,
            };
          }
          updateStreamingMessage();
        }
      };

      const handleToolResult = (e: MessageEvent) => {
        const event: AgentEvent = JSON.parse(e.data);
        if (event.type === 'tool-result' && streamingRef.current) {
          streamingRef.current.blocks.push({
            type: 'tool-result',
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            result: event.result,
          });
          updateStreamingMessage();
        }
      };

      const handleToolError = (e: MessageEvent) => {
        const event: AgentEvent = JSON.parse(e.data);
        if (event.type === 'tool-error' && streamingRef.current) {
          streamingRef.current.blocks.push({
            type: 'tool-result',
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            result: event.error,
            isError: true,
          });
          updateStreamingMessage();
        }
      };

      const handleDone = () => {
        streamingRef.current = null;
        es.close();
        setIsStreaming(false);
        // Reload the session to get persisted messages with proper IDs
        if (currentSessionIdRef.current) {
          getSession(currentSessionIdRef.current).then((data) => {
            setMessages(data.messages);
          }).catch(console.error);
        }
      };

      let errorHandled = false;
      const handleError = (msg: string) => {
        if (errorHandled) return;
        errorHandled = true;
        streamingRef.current = null;
        // Remove the streaming message and optimistic user message
        setMessages((prev) => prev.filter((m) => m.id !== '__streaming__' && m.id !== '__user_pending__'));
        setLastFailedInput(text);
        setError(msg);
        es.close();
        setIsStreaming(false);
      };

      const handleServerError = (e: MessageEvent) => {
        let errMsg = '请求失败';
        try {
          const data = JSON.parse(e.data);
          errMsg = data.error || errMsg;
        } catch { /* ignore */ }
        handleError(errMsg);
      };

      // Register SSE event listeners
      es.addEventListener('text-start', handleTextStart);
      es.addEventListener('text-delta', handleTextDelta);
      es.addEventListener('text-end', handleTextEnd);
      es.addEventListener('reasoning-start', handleReasoningStart);
      es.addEventListener('reasoning-delta', handleReasoningDelta);
      es.addEventListener('reasoning-end', handleReasoningEnd);
      es.addEventListener('tool-call-start', handleToolCallStart);
      es.addEventListener('tool-call-args', handleToolCallArgs);
      es.addEventListener('tool-result', handleToolResult);
      es.addEventListener('tool-error', handleToolError);
      es.addEventListener('done', handleDone);
      es.addEventListener('error', (e: Event) => {
        const me = e as MessageEvent;
        if (!me.data) return; // native error, let onerror handle it
        handleServerError(me);
      });

      es.onerror = () => {
        handleError('连接失败，请检查 API 设置');
      };
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessages((prev) => prev.filter((m) => m.id !== '__user_pending__'));
      setLastFailedInput(text);
      setError(err instanceof Error ? err.message : '发送失败');
      setIsStreaming(false);
    }
  }, [isStreaming, onSessionCreated, updateStreamingMessage]);

  const abort = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      streamingRef.current = null;
      setIsStreaming(false);
    }
  }, []);

  return { messages, isStreaming, loading, error, lastFailedInput, send, abort };
}
