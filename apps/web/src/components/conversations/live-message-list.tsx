'use client';

import type { ConversationMessage } from './message-list';
import { MessageList } from './message-list';
import { useLiveMessages } from '@/lib/realtime/supabase-subscribe';

export function LiveMessageList({
  conversationId,
  initialMessages,
}: {
  conversationId: string;
  initialMessages: ConversationMessage[];
}) {
  const messages = useLiveMessages(conversationId, initialMessages);

  return <MessageList messages={messages} />;
}
