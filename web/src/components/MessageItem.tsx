import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message } from '../types';

interface MessageItemProps {
  message: Message;
}

export function MessageItem({ message }: MessageItemProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="bg-blue-500 text-white px-4 py-2 rounded-lg max-w-2xl">
          <div className="text-sm">{typeof message.content === 'string' ? message.content : message.content[0]?.text || ''}</div>
        </div>
      </div>
    );
  }

  if (message.role === 'assistant') {
    const textContent = message.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n');

    const toolCalls = message.content.filter((c: any) => c.type === 'toolCall');

    return (
      <div className="flex justify-start mb-4">
        <div className="bg-gray-100 px-4 py-2 rounded-lg max-w-2xl">
          {textContent && (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent}</ReactMarkdown>
            </div>
          )}
          {toolCalls.length > 0 && (
            <div className="mt-2 space-y-2">
              {toolCalls.map((tc: any, i: number) => (
                <div key={i} className="bg-white border border-gray-300 rounded p-2 text-xs">
                  <div className="font-semibold text-gray-700">🔧 {tc.name}</div>
                  <div className="text-gray-500 mt-1">
                    {JSON.stringify(tc.arguments, null, 2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (message.role === 'toolResult') {
    const textContent = message.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n');

    return (
      <div className="flex justify-start mb-4">
        <div className={`px-4 py-2 rounded-lg max-w-2xl border ${message.isError ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'}`}>
          <div className="text-xs font-semibold text-gray-600 mb-1">
            {message.isError ? '❌' : '✓'} {message.toolName}
          </div>
          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
            {textContent}
          </pre>
        </div>
      </div>
    );
  }

  return null;
}
