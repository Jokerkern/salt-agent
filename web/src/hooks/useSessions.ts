import { useState, useEffect } from 'react';
import { getSessions } from '../lib/api';
import type { SessionMetadata } from '../types';

export function useSessions(autoRefresh = true, refreshKey = 0) {
  const [sessions, setSessions] = useState<SessionMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const data = await getSessions();
      setSessions(data.sessions);
      setError(null);
    } catch (err) {
      console.error('获取会话列表失败:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();

    if (autoRefresh) {
      const interval = setInterval(fetchSessions, 10000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshKey]);

  return { sessions, loading, error, refresh: fetchSessions };
}
