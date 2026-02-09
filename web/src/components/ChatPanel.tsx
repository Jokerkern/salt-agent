import { useEffect, useRef } from 'react';
import { MessageItem } from './MessageItem';
import { useChat } from '../hooks/useChat';

interface ChatPanelProps {
  sessionId: string | null;
  onSessionCreated?: (sessionId: string) => void;
}

export function ChatPanel({ sessionId, onSessionCreated }: ChatPanelProps) {
  const { messages, isStreaming, loading, send } = useChat(sessionId, onSessionCreated);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputRef.current?.value.trim();
    if (!text || isStreaming) return;

    send(text);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  // Always show chat interface, even for new sessions
  const isNewSession = sessionId && messages.length === 0 && !loading;

  if (!sessionId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center text-gray-400">
          <p className="text-lg">👈 点击左侧"新建会话"开始</p>
          <p className="text-sm mt-2">或选择已有会话继续对话</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white">
      <div className="border-b border-gray-200 px-6 py-4 bg-gray-50">
        <h2 className="text-lg font-semibold text-gray-700">
          {isNewSession ? '🆕 新会话' : `会话 #${sessionId.slice(0, 8)}`}
        </h2>
        {isNewSession && (
          <p className="text-sm text-gray-500 mt-1">输入消息开始对话...</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <p className="text-gray-400 text-center">加载中...</p>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-400 mt-20">
            <p className="text-2xl mb-2">👋</p>
            <p className="text-lg">开始对话吧！</p>
            <p className="text-sm mt-2 text-gray-500">试试说："读取 package.json 文件"</p>
          </div>
        ) : (
          messages.map((msg, i) => <MessageItem key={i} message={msg} />)
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            ref={inputRef}
            placeholder="输入消息..."
            disabled={isStreaming}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <button
            type="submit"
            disabled={isStreaming}
            className="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg font-medium transition"
          >
            {isStreaming ? '发送中...' : '发送'}
          </button>
        </form>
      </div>
    </div>
  );
}
