import { useSessions } from '../hooks/useSessions';
import { formatRelativeTime, truncate } from '../lib/utils';
import type { SessionMetadata } from '../types';

interface SessionListProps {
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
}

export function SessionList({ currentSessionId, onSelectSession, onNewSession }: SessionListProps) {
  const { sessions, loading, error } = useSessions(true);

  if (loading && sessions.length === 0) {
    return (
      <div className="w-64 bg-gray-50 border-r border-gray-200 p-4">
        <p className="text-gray-500 text-sm">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-64 bg-gray-50 border-r border-gray-200 p-4">
        <p className="text-red-500 text-sm">加载失败: {error}</p>
      </div>
    );
  }

  return (
    <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={onNewSession}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition"
        >
          + 新建会话
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <p className="text-gray-400 text-sm text-center mt-4">暂无会话</p>
        ) : (
          sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              isActive={session.id === currentSessionId}
              onClick={() => onSelectSession(session.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SessionCard({ session, isActive, onClick }: { session: SessionMetadata; isActive: boolean; onClick: () => void }) {
  const sourceIcon = session.source === 'im' ? '💬' : '🌐';
  const sourceName = session.source === 'im' ? 'IM' : 'Web';

  return (
    <div
      onClick={onClick}
      className={`
        p-3 mb-2 rounded-lg cursor-pointer transition
        ${isActive ? 'bg-blue-100 border-2 border-blue-500' : 'bg-white hover:bg-gray-100 border border-gray-200'}
      `}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-500">
          {sourceIcon} {sourceName}
        </span>
        <span className="text-xs text-gray-400">
          {formatRelativeTime(session.updatedAt)}
        </span>
      </div>
      <div className="text-sm font-medium text-gray-700">
        {truncate(session.id, 12)}
      </div>
      {session.userId && (
        <div className="text-xs text-gray-500 mt-1">
          用户: {session.userId}
        </div>
      )}
    </div>
  );
}
