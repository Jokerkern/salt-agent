import { useState } from 'react';
import { useSessions } from '../hooks/useSessions';
import { deleteSession } from '../lib/api';
import { formatRelativeTime, truncate } from '../lib/utils';
import type { SessionMetadata } from '../types';

interface SessionListProps {
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession?: (id: string) => void;
  refreshKey?: number;
}

export function SessionList({ currentSessionId, onSelectSession, onNewSession, onDeleteSession, refreshKey = 0 }: SessionListProps) {
  const { sessions, loading, error, refresh } = useSessions(true, refreshKey);

  const handleDelete = async (id: string) => {
    try {
      await deleteSession(id);
      onDeleteSession?.(id);
      refresh();
    } catch (err) {
      console.error('删除会话失败:', err);
    }
  };

  const webSessions = sessions.filter((s) => s.source === 'web');
  const imSessions = sessions.filter((s) => s.source === 'im');

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shadow-lg shadow-accent/20">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
        <span className="text-text-primary font-semibold text-[15px] tracking-tight">Salt Agent</span>
      </div>

      {/* New Chat */}
      <div className="px-3 pb-3">
        <button
          onClick={onNewSession}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-surface-4/60 text-text-secondary hover:text-text-primary hover:bg-surface-3/50 hover:border-surface-5/50 transition-all duration-200 group"
        >
          <svg className="w-4 h-4 text-text-muted group-hover:text-accent-light transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span className="text-sm">新建会话</span>
        </button>
      </div>

      {/* Divider */}
      <div className="h-px bg-surface-4/40 mx-3" />

      {/* Session List */}
      <div className="flex-1 overflow-y-auto px-2 pt-2">
        {loading && sessions.length === 0 ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : error ? (
          <div className="px-3 py-4 text-sm text-status-error">{error}</div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-muted text-sm">暂无会话</p>
            <p className="text-text-faint text-xs mt-1">点击上方按钮开始</p>
          </div>
        ) : (
          <>
            {webSessions.length > 0 && (
              <SessionGroup
                title="Web"
                sessions={webSessions}
                currentId={currentSessionId}
                onSelect={onSelectSession}
                onDelete={handleDelete}
              />
            )}
            {imSessions.length > 0 && (
              <SessionGroup
                title="IM"
                sessions={imSessions}
                currentId={currentSessionId}
                onSelect={onSelectSession}
                onDelete={handleDelete}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SessionGroup({
  title,
  sessions,
  currentId,
  onSelect,
  onDelete,
}: {
  title: string;
  sessions: SessionMetadata[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <div className="mb-1">
      <div className="px-3 py-2 text-2xs font-semibold text-text-faint uppercase tracking-widest">
        {title}
      </div>
      {sessions.map((session) => {
        const active = currentId === session.id;
        const confirming = confirmId === session.id;
        return (
          <div
            key={session.id}
            className={`relative w-full text-left px-3 py-2.5 rounded-lg mb-0.5 transition-all duration-150 group cursor-pointer ${
              active
                ? 'bg-surface-3 text-text-primary'
                : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
            }`}
            onClick={() => onSelect(session.id)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium truncate">
                {truncate(session.title || session.id, 20)}
              </span>
              <span className="text-2xs text-text-faint flex-shrink-0 flex items-center gap-1">
                <span className={confirming ? 'hidden' : 'group-hover:hidden'}>
                  {formatRelativeTime(session.updatedAt)}
                </span>
                {confirming ? (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(session.id);
                        setConfirmId(null);
                      }}
                      className="text-2xs text-status-error hover:text-red-400 transition-colors px-1"
                      title="确认删除"
                    >
                      确认
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmId(null);
                      }}
                      className="text-2xs text-text-muted hover:text-text-primary transition-colors px-1"
                      title="取消"
                    >
                      取消
                    </button>
                  </>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmId(session.id);
                    }}
                    className="hidden group-hover:block text-text-muted hover:text-status-error transition-colors"
                    title="删除会话"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                )}
              </span>
            </div>
            {session.userId && (
              <div className="text-2xs text-text-faint mt-0.5 truncate">
                {session.userId}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Spinner() {
  return (
    <div className="w-5 h-5 border-2 border-surface-5 border-t-accent-light rounded-full animate-spin" />
  );
}
