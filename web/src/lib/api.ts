import type { SessionMetadata, Message } from '../types';

const API_BASE = import.meta.env.DEV ? '' : '';

export async function getSessions(): Promise<{ sessions: SessionMetadata[] }> {
  const res = await fetch(`${API_BASE}/api/sessions`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getSession(id: string): Promise<{ metadata: SessionMetadata; messages: Message[] }> {
  const res = await fetch(`${API_BASE}/api/sessions/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function sendMessage(message: string, sessionId?: string): Promise<{ session_id: string }> {
  const res = await fetch(`${API_BASE}/api/chat/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function deleteSession(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/sessions/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function createSSE(sessionId: string, message: string): EventSource {
  return new EventSource(
    `${API_BASE}/api/chat/stream/${sessionId}?message=${encodeURIComponent(message)}`
  );
}
