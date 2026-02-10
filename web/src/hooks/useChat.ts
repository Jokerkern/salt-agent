import { useState, useEffect, useRef } from 'react';
import { getSession, sendMessage, createSSE } from '../lib/api';
import type { Message, AgentEvent } from '../types';

export function useChat(sessionId: string | null, onSessionCreated?: (id: string) => void) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [loading, setLoading] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const currentSessionIdRef = useRef<string | null>(sessionId);
  const skipNextLoadRef = useRef(false);

  // Update ref when prop changes
  useEffect(() => {
    currentSessionIdRef.current = sessionId;
  }, [sessionId]);

  // Load session messages
  useEffect(() => {
    if (sessionId) {
      // Skip reload when we just updated the session ID mid-stream
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
          // Session doesn't exist yet, that's ok for new sessions
          setMessages([]);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setMessages([]);
    }
  }, [sessionId]);

  const send = async (text: string) => {
    if (isStreaming) return;

    try {
      setIsStreaming(true);

      // Add user message
      const userMsg: Message = {
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // Get or create session
      const result = await sendMessage(text, currentSessionIdRef.current || undefined);
      const sid = result.session_id;

      // Update session ID if server returned a different one (new session)
      if (sid && sid !== currentSessionIdRef.current) {
        currentSessionIdRef.current = sid;
        skipNextLoadRef.current = true;
        onSessionCreated?.(sid);
      }

      // Connect SSE - use the ref to ensure we have the right session ID
      const es = createSSE(currentSessionIdRef.current || sid, text);
      eventSourceRef.current = es;

      let partialMessage: Message | null = null;

      const handleEvent = (e: MessageEvent) => {
        const event: AgentEvent = JSON.parse(e.data);

        // Skip user messages from SSE — they are already added optimistically
        if (event.message?.role === 'user') return;

        switch (event.type) {
          case 'message_start':
            if (event.message) {
              partialMessage = event.message;
              setMessages((prev) => [...prev, partialMessage!]);
            }
            break;

          case 'message_update':
            if (event.message) {
              partialMessage = event.message;
              setMessages((prev) => [...prev.slice(0, -1), partialMessage!]);
            }
            break;

          case 'message_end':
            if (event.message) {
              setMessages((prev) => [...prev.slice(0, -1), event.message!]);
            }
            partialMessage = null;
            break;

          case 'agent_end':
            es.close();
            setIsStreaming(false);
            break;
        }
      };

      es.addEventListener('message_start', handleEvent);
      es.addEventListener('message_update', handleEvent);
      es.addEventListener('message_end', handleEvent);
      es.addEventListener('agent_end', handleEvent);
      es.addEventListener('turn_start', handleEvent);
      es.addEventListener('turn_end', handleEvent);

      es.onerror = () => {
        es.close();
        setIsStreaming(false);
      };
    } catch (err) {
      console.error('Failed to send message:', err);
      setIsStreaming(false);
    }
  };

  const abort = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsStreaming(false);
    }
  };

  return { messages, isStreaming, loading, send, abort };
}
