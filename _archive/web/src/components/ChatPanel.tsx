import { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '../hooks/useChat';
import { useTheme } from '../hooks/useTheme';
import type { MessageInfo, ToolCallBlock, ToolResultBlock } from '../types';

// ─── Icons (inline SVG) ─────────────────────────────────────────────────────

function IconSidebar() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}

function IconSidebarClose() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
    </svg>
  );
}

function IconStop() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function IconBot() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    </svg>
  );
}

function IconTool() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.19 5.19a2.121 2.121 0 01-3-3l5.19-5.19m0 0L15 9.31m-3.58 5.86l2.5-2.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    </svg>
  );
}

function IconBolt() {
  return (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function IconSun() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c-.007.378-.138.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconBrain() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
    </svg>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface ChatPanelProps {
  sessionId: string | null;
  onSessionCreated?: (sessionId: string) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenSettings?: () => void;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ChatPanel({ sessionId, onSessionCreated, sidebarOpen, onToggleSidebar, onOpenSettings }: ChatPanelProps) {
  const { messages, isStreaming, loading, error, lastFailedInput, send, abort } = useChat(sessionId, onSessionCreated);
  const [inputValue, setInputValue] = useState('');

  // Restore failed input to the text box
  useEffect(() => {
    if (lastFailedInput) {
      setInputValue(lastFailedInput);
    }
  }, [lastFailedInput]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSubmit = useCallback(() => {
    const value = inputValue.trim();
    if (!value || isStreaming) return;
    send(value);
    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [inputValue, isStreaming, send]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleTextareaInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, []);

  const handleSuggestionClick = useCallback(
    (text: string) => {
      if (isStreaming) return;
      send(text);
    },
    [isStreaming, send]
  );

  // ─── No session selected ───────────────────────────────────────────────

  if (!sessionId) {
    return (
      <div className="flex-1 flex flex-col h-full">
        <TopBar sidebarOpen={sidebarOpen} onToggleSidebar={onToggleSidebar} onOpenSettings={onOpenSettings} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center animate-fade-in px-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/20 to-accent-dark/20 border border-accent-border flex items-center justify-center mx-auto mb-6">
              <IconChat />
            </div>
            <h2 className="text-2xl font-semibold text-text-primary mb-2">Salt Agent</h2>
            <p className="text-text-muted text-sm">选择已有会话或新建会话开始对话</p>
          </div>
        </div>
    </div>
  );
}

  return (
    <div className="flex-1 flex flex-col h-full">
      <TopBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={onToggleSidebar}
        isStreaming={isStreaming}
        onOpenSettings={onOpenSettings}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          {loading ? (
            <div className="flex justify-center py-24">
              <div className="flex items-center gap-3 text-text-muted">
                <div className="w-5 h-5 border-2 border-surface-5 border-t-accent-light rounded-full animate-spin" />
                <span className="text-sm">加载消息中...</span>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <WelcomeScreen onSuggestionClick={handleSuggestionClick} />
          ) : (
            messages
              .filter((m) => m.role !== 'tool')
              .map((msg, idx, arr) => (
                <MessageBubble
                  key={msg.id + '-' + idx}
                  message={msg}
                  isLast={idx === arr.length - 1}
                  isStreaming={isStreaming}
                />
              ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-surface-4/40 bg-surface-0/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
          {error && (
            <div className="mb-2 px-3 py-2 rounded-lg bg-status-error-muted border border-status-error-border text-status-error text-sm">
              {error}
            </div>
          )}
          <div className="relative flex items-end gap-2 bg-surface-2 border border-surface-4/60 rounded-2xl px-4 py-3 focus-within:border-accent/40 focus-within:ring-1 focus-within:ring-accent/20 transition-all duration-200">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder={messages.length === 0 ? '输入消息开始对话...' : '输入消息...'}
              disabled={isStreaming}
              rows={1}
              className="flex-1 bg-transparent text-text-primary placeholder:text-text-faint resize-none outline-none text-sm leading-relaxed max-h-[200px] disabled:opacity-50"
            />
            {isStreaming ? (
              <button
                onClick={abort}
                className="flex-shrink-0 w-8 h-8 rounded-lg bg-status-error-muted text-status-error flex items-center justify-center hover:bg-status-error/20 transition-colors"
                title="停止生成"
              >
                <IconStop />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!inputValue.trim()}
                className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center hover:bg-accent-dark disabled:opacity-25 disabled:hover:bg-accent transition-colors"
                title="发送"
              >
                <IconSend />
              </button>
            )}
          </div>
          <p className="text-2xs text-text-faint mt-2 text-center select-none">
            Enter 发送 / Shift+Enter 换行
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Top Bar ────────────────────────────────────────────────────────────────

function TopBar({
  sidebarOpen,
  onToggleSidebar,
  isStreaming,
  onOpenSettings,
}: {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  isStreaming?: boolean;
  onOpenSettings?: () => void;
}) {
  const { theme, toggle: toggleTheme } = useTheme();

  return (
    <div className="h-12 flex items-center px-3 border-b border-surface-4/30 flex-shrink-0 gap-2">
      <button
        onClick={onToggleSidebar}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
        title={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
      >
        {sidebarOpen ? <IconSidebarClose /> : <IconSidebar />}
      </button>

      {isStreaming && (
        <div className="flex items-center gap-2 ml-1">
          <span className="inline-flex items-center gap-1.5 text-xs text-accent-light">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-light animate-pulse" />
            生成中
          </span>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Settings */}
      <button
        onClick={onOpenSettings}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
        title="设置"
      >
        <IconSettings />
      </button>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
        title={theme === 'dark' ? '切换亮色模式' : '切换暗色模式'}
      >
        {theme === 'dark' ? <IconSun /> : <IconMoon />}
      </button>
    </div>
  );
}

// ─── Welcome Screen ─────────────────────────────────────────────────────────

function WelcomeScreen({ onSuggestionClick }: { onSuggestionClick: (text: string) => void }) {
  const suggestions = [
    '读取 package.json 文件',
    '帮我分析项目结构',
    '列出当前目录的文件',
  ];

  return (
    <div className="flex items-center justify-center min-h-[60vh] animate-fade-in">
      <div className="text-center max-w-md w-full">
        <div className="w-14 h-14 rounded-2xl bg-accent-muted border border-accent-border flex items-center justify-center mx-auto mb-6 text-accent-light">
          <IconBolt />
        </div>
        <h3 className="text-xl font-semibold text-text-primary mb-2">开始对话</h3>
        <p className="text-text-muted text-sm mb-8">试试以下指令：</p>
        <div className="flex flex-col gap-2">
          {suggestions.map((text) => (
            <button
              key={text}
              onClick={() => onSuggestionClick(text)}
              className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-surface-4/50 text-text-secondary text-sm text-left hover:border-accent-border hover:text-text-primary hover:bg-surface-3/50 transition-all duration-200"
            >
              {text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Message Bubble ─────────────────────────────────────────────────────────

function MessageBubble({
  message,
  isLast,
  isStreaming,
}: {
  message: MessageInfo;
  isLast: boolean;
  isStreaming: boolean;
}) {
  if (message.role === 'user') {
    return <UserBubble message={message} />;
  }

  if (message.role === 'assistant') {
    return (
      <AssistantBubble
        message={message}
        isLast={isLast}
        isStreaming={isStreaming}
      />
    );
  }

  return null;
}

// ─── User Bubble ────────────────────────────────────────────────────────────

function UserBubble({ message }: { message: MessageInfo }) {
  const textContent = message.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  return (
    <div className="flex justify-end mb-5 animate-slide-up">
      <div className="max-w-[85%] bg-accent-muted border border-accent-border text-text-primary px-4 py-2.5 rounded-2xl rounded-br-md">
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{textContent}</p>
      </div>
    </div>
  );
}

// ─── Assistant Bubble ───────────────────────────────────────────────────────

function AssistantBubble({
  message,
  isLast,
  isStreaming,
}: {
  message: MessageInfo;
  isLast: boolean;
  isStreaming: boolean;
}) {
  const [copied, setCopied] = useState(false);

  // Separate content blocks by type
  const textBlocks = message.content.filter((b): b is { type: 'text'; text: string } => b.type === 'text');
  const reasoningBlocks = message.content.filter((b): b is { type: 'reasoning'; text: string } => b.type === 'reasoning');
  const toolCallBlocks = message.content.filter((b): b is ToolCallBlock => b.type === 'tool-call');
  const toolResultBlocks = message.content.filter((b): b is ToolResultBlock => b.type === 'tool-result');
  const reasoningContent = reasoningBlocks.map((b) => b.text).join('\n');
  const textContent = textBlocks.map((b) => b.text).join('\n');

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(textContent || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [textContent]);

  return (
    <div className="mb-5 animate-slide-up group/msg">
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-surface-3 border border-surface-4/50 flex items-center justify-center mt-0.5 text-accent-light">
          <IconBot />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Tool calls */}
          {toolCallBlocks.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {toolCallBlocks.map((tc, tcIdx) => {
                const result = toolResultBlocks.find(
                  (r) => r.toolCallId === tc.toolCallId
                );
                const isRunning = isStreaming && isLast && !result;
                return (
                  <ToolCallCard
                    key={tc.toolCallId || tcIdx}
                    toolCall={tc}
                    result={result}
                    isRunning={isRunning}
                  />
                );
              })}
            </div>
          )}

          {/* Reasoning */}
          {reasoningContent && (
            <div className="mb-3">
              <ReasoningCard content={reasoningContent} isStreaming={isLast && isStreaming} />
            </div>
          )}

          {/* Text */}
          {textContent && (
            <div className="relative">
              <MarkdownContent content={textContent} isTyping={isLast && isStreaming} />

              {/* Copy button */}
              {!isStreaming && textContent && (
                <button
                  onClick={handleCopy}
                  className="absolute -bottom-1 right-0 opacity-0 group-hover/msg:opacity-100 flex items-center gap-1 px-2 py-1 rounded-md text-2xs text-text-muted hover:text-text-secondary hover:bg-surface-3 transition-all duration-200"
                >
                  {copied ? <IconCheck /> : <IconCopy />}
                  {copied ? '已复制' : '复制'}
                </button>
              )}
            </div>
          )}

          {/* Streaming cursor when no text yet but streaming */}
          {!textContent && isLast && isStreaming && toolCallBlocks.length === 0 && (
            <div className="md-body typing-cursor">
              <span className="invisible">.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Markdown Content ───────────────────────────────────────────────────────

function MarkdownContent({ content, isTyping }: { content: string; isTyping: boolean }) {
  return (
    <div className={`md-body ${isTyping ? 'typing-cursor' : ''}`}>
      <SimpleMarkdown text={content} />
    </div>
  );
}

// Simple markdown-to-JSX renderer (handles common patterns)
function SimpleMarkdown({ text }: { text: string }) {
  // Split by code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const lines = part.slice(3, -3);
          const firstNewline = lines.indexOf('\n');
          const lang = firstNewline > 0 ? lines.slice(0, firstNewline).trim() : '';
          const code = firstNewline > 0 ? lines.slice(firstNewline + 1) : lines;
          return (
            <pre key={i} className="bg-surface-2 border border-surface-4/50 rounded-lg p-3 my-2 overflow-x-auto">
              {lang && (
                <div className="text-2xs text-text-faint mb-2 font-mono">{lang}</div>
              )}
              <code className="text-[13px] font-mono leading-relaxed text-text-primary">{code}</code>
            </pre>
          );
        }

        // Process inline markdown
        return <InlineMarkdown key={i} text={part} />;
      })}
    </>
  );
}

function InlineMarkdown({ text }: { text: string }) {
  // Split by paragraphs
  const paragraphs = text.split(/\n\n+/);

  return (
    <>
      {paragraphs.map((para, i) => {
        const trimmed = para.trim();
        if (!trimmed) return null;

        // Headers
        if (trimmed.startsWith('### ')) {
          return <h3 key={i} className="text-base font-semibold text-text-primary mt-4 mb-2">{processInline(trimmed.slice(4))}</h3>;
        }
        if (trimmed.startsWith('## ')) {
          return <h2 key={i} className="text-lg font-semibold text-text-primary mt-4 mb-2">{processInline(trimmed.slice(3))}</h2>;
        }
        if (trimmed.startsWith('# ')) {
          return <h1 key={i} className="text-xl font-semibold text-text-primary mt-4 mb-2">{processInline(trimmed.slice(2))}</h1>;
        }

        // Unordered list
        const listLines = trimmed.split('\n');
        if (listLines.every((l) => /^[-*]\s/.test(l.trim()))) {
          return (
            <ul key={i} className="list-disc pl-5 mb-2 space-y-0.5">
              {listLines.map((line, j) => (
                <li key={j} className="text-sm leading-relaxed">{processInline(line.replace(/^[-*]\s/, ''))}</li>
              ))}
            </ul>
          );
        }

        // Ordered list
        if (listLines.every((l) => /^\d+\.\s/.test(l.trim()))) {
          return (
            <ol key={i} className="list-decimal pl-5 mb-2 space-y-0.5">
              {listLines.map((line, j) => (
                <li key={j} className="text-sm leading-relaxed">{processInline(line.replace(/^\d+\.\s/, ''))}</li>
              ))}
            </ol>
          );
        }

        // Blockquote
        if (trimmed.startsWith('> ')) {
          return (
            <blockquote key={i} className="border-l-3 border-accent pl-3 my-2 text-text-secondary italic">
              {processInline(trimmed.replace(/^>\s?/gm, ''))}
            </blockquote>
          );
        }

        // Regular paragraph with line breaks
        return (
          <p key={i} className="text-sm leading-relaxed mb-2 last:mb-0">
            {trimmed.split('\n').map((line, j, arr) => (
              <span key={j}>
                {processInline(line)}
                {j < arr.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}

// Process inline markdown (bold, italic, code, links)
function processInline(text: string): React.ReactNode {
  // Split by inline code first
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="bg-surface-3 text-accent-light px-1.5 py-0.5 rounded text-[13px] font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }

    // Bold
    let result: React.ReactNode = part;
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    if (boldParts.length > 1) {
      result = boldParts.map((bp, j) => {
        if (bp.startsWith('**') && bp.endsWith('**')) {
          return <strong key={j} className="font-semibold text-text-primary">{bp.slice(2, -2)}</strong>;
        }
        return bp;
      });
    }

    return <span key={i}>{result}</span>;
  });
}

// ─── Tool Call Card ─────────────────────────────────────────────────────────

function ToolCallCard({
  toolCall,
  result,
  isRunning,
}: {
  toolCall: ToolCallBlock;
  result?: ToolResultBlock;
  isRunning: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const isDone = !!result;
  const isError = result?.isError;

  let borderColor: string;
  let bgColor: string;
  let textColor: string;
  let statusLabel: string;

  if (isDone && isError) {
    borderColor = 'border-status-error-border';
    bgColor = 'bg-status-error-muted';
    textColor = 'text-status-error';
    statusLabel = '失败';
  } else if (isDone) {
    borderColor = 'border-status-success-border';
    bgColor = 'bg-status-success-muted';
    textColor = 'text-status-success';
    statusLabel = '完成';
  } else if (isRunning) {
    borderColor = 'border-status-warning-border';
    bgColor = 'bg-status-warning-muted';
    textColor = 'text-status-warning';
    statusLabel = '执行中';
  } else {
    borderColor = 'border-surface-4/50';
    bgColor = 'bg-surface-2';
    textColor = 'text-text-muted';
    statusLabel = '等待';
  }

  const resultText = result
    ? typeof result.result === 'string'
      ? result.result
      : JSON.stringify(result.result, null, 2)
    : undefined;

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors duration-200 ${borderColor} ${bgColor}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left ${textColor}`}
      >
        <IconTool />
        <span className="text-xs font-medium flex-1 truncate">{toolCall.toolName}</span>

        {isRunning && (
          <div className="w-3 h-3 border-[1.5px] border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
        )}

        <span className="text-2xs opacity-75 flex-shrink-0">{statusLabel}</span>
        <IconChevron open={expanded} />
      </button>

      {expanded && (
        <div className="px-3 pb-3 animate-fade-in">
          <div className="space-y-2">
            <div>
              <div className="text-2xs uppercase tracking-wider opacity-40 mb-1 font-medium">参数</div>
              <pre className={`rounded-lg p-2.5 overflow-x-auto font-mono text-[11px] leading-relaxed ${textColor}`} style={{ background: 'var(--tool-detail-bg)' }}>
                {JSON.stringify(toolCall.args, null, 2)}
              </pre>
            </div>
            {resultText && (
              <div>
                <div className="text-2xs uppercase tracking-wider opacity-40 mb-1 font-medium">结果</div>
                <pre className={`rounded-lg p-2.5 overflow-x-auto font-mono text-[11px] leading-relaxed max-h-48 overflow-y-auto ${textColor}`} style={{ background: 'var(--tool-detail-bg)' }}>
                  {resultText}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Reasoning Card ────────────────────────────────────────────────────────

function ReasoningCard({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-surface-4/50 rounded-xl overflow-hidden bg-surface-2/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-text-muted hover:text-text-secondary transition-colors"
      >
        <IconBrain />
        <span className="text-xs font-medium flex-1">推理过程</span>
        {isStreaming && (
          <div className="w-3 h-3 border-[1.5px] border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
        )}
        <IconChevron open={expanded} />
      </button>

      {expanded && (
        <div className="px-3 pb-3 animate-fade-in">
          <div className="text-2xs uppercase tracking-wider opacity-40 mb-1 font-medium">思考内容</div>
          <div className={`text-sm leading-relaxed text-text-secondary whitespace-pre-wrap ${isStreaming ? 'typing-cursor' : ''}`}>
            {content}
          </div>
        </div>
      )}
    </div>
  );
}
