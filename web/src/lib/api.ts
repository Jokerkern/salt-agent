import type { SessionInfo, MessageInfo, ProviderInfo, ProviderConfig } from '../types';

const API_BASE = import.meta.env.DEV ? '' : '';

// ─── Sessions ────────────────────────────────────────────────────────────────

export async function getSessions(): Promise<{ sessions: SessionInfo[] }> {
  const res = await fetch(`${API_BASE}/api/sessions`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getSession(id: string): Promise<SessionInfo & { messages: MessageInfo[] }> {
  const res = await fetch(`${API_BASE}/api/sessions/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function createSession(input?: { title?: string; agent?: string }): Promise<SessionInfo> {
  const res = await fetch(`${API_BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input ?? {}),
  });
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

// ─── Providers ───────────────────────────────────────────────────────────────

export async function getAvailableProviders(): Promise<{ providers: ProviderInfo[] }> {
  const res = await fetch(`${API_BASE}/api/providers/available`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getProviderConfigs(): Promise<{ providers: ProviderConfig[] }> {
  const res = await fetch(`${API_BASE}/api/providers`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getProviderConfig(id: string): Promise<ProviderConfig> {
  const res = await fetch(`${API_BASE}/api/providers/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function createProviderConfig(input: {
  providerId: string;
  name: string;
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
  options?: string;
  isDefault?: boolean;
}): Promise<ProviderConfig> {
  const res = await fetch(`${API_BASE}/api/providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function updateProviderConfig(
  id: string,
  input: Partial<{
    name: string;
    apiKey: string;
    baseUrl: string;
    modelId: string;
    options: string;
    isDefault: boolean;
  }>,
): Promise<ProviderConfig> {
  const res = await fetch(`${API_BASE}/api/providers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function deleteProviderConfig(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/providers/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function getAllSettings(): Promise<Record<string, string>> {
  const res = await fetch(`${API_BASE}/api/settings`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function setSettings(data: Record<string, unknown>): Promise<{ updated: number }> {
  const res = await fetch(`${API_BASE}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
