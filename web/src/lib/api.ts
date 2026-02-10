import type { SessionMetadata, Message } from '../types';

const API_BASE = import.meta.env.DEV ? '' : '';

// ─── Sessions ────────────────────────────────────────────────────────────────

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

export async function deleteSession(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/sessions/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export async function sendMessage(message: string, sessionId?: string): Promise<{ session_id: string }> {
  const res = await fetch(`${API_BASE}/api/chat/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function createSSE(sessionId: string, message: string): EventSource {
  return new EventSource(
    `${API_BASE}/api/chat/stream/${sessionId}?message=${encodeURIComponent(message)}`
  );
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface SettingsResponse {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  hasApiKey: boolean;
}

export async function getSettings(): Promise<SettingsResponse> {
  const res = await fetch(`${API_BASE}/api/settings`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function saveSettings(data: { baseUrl?: string; apiKey?: string; model?: string; systemPrompt?: string }): Promise<SettingsResponse> {
  const res = await fetch(`${API_BASE}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface ModelInfo {
  id: string;
  name: string;
}

export async function fetchModels(baseUrl?: string, apiKey?: string): Promise<{ models: ModelInfo[] }> {
  const res = await fetch(`${API_BASE}/api/settings/fetch-models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl, apiKey }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
