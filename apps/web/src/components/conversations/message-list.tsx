import { cn } from '@/lib/utils';
import {
  formatConversationTime,
  getAuthorBubbleClasses,
  getAuthorLabel,
} from './helpers';

export type ConversationMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  authorType: 'ai' | 'human_agent' | 'prospect';
  content: string;
  channel: 'website' | 'messenger' | 'phone';
  createdAt: string;
};

export function MessageList({
  messages,
  emptyText = 'No messages yet.',
}: {
  messages: ConversationMessage[];
  emptyText?: string;
}) {
  if (messages.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-400">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <div
          key={message.id}
          className={cn(
            'max-w-[85%] rounded-2xl px-4 py-3 shadow-sm',
            getAuthorBubbleClasses(message.authorType),
          )}
        >
          <div className="mb-2 flex items-center gap-2 text-xs text-zinc-400">
            <span className="font-medium text-zinc-200">{getAuthorLabel(message.authorType)}</span>
            <span>•</span>
            <span>{formatConversationTime(message.createdAt)}</span>
          </div>
          <div className="whitespace-pre-wrap text-sm leading-6">{message.content}</div>
        </div>
      ))}
    </div>
  );
}
