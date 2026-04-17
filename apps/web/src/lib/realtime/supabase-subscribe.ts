'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ConversationMessage } from '@/components/conversations/message-list';

export function useLiveMessages(
  conversationId: string,
  initial: ConversationMessage[],
): ConversationMessage[] {
  const [messages, setMessages] = useState<ConversationMessage[]>(initial);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            role: 'user' | 'assistant' | 'system';
            author_type?: 'ai' | 'human_agent' | 'prospect';
            authorType?: 'ai' | 'human_agent' | 'prospect';
            content: string;
            channel: 'website' | 'messenger' | 'phone';
            created_at?: string;
            createdAt?: string;
          };

          const nextMessage: ConversationMessage = {
            id: row.id,
            role: row.role,
            authorType: row.authorType ?? row.author_type ?? 'ai',
            content: row.content,
            channel: row.channel,
            createdAt: row.createdAt ?? row.created_at ?? new Date().toISOString(),
          };

          setMessages((prev) => {
            if (prev.some((message) => message.id === nextMessage.id)) return prev;
            return [...prev, nextMessage];
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId]);

  return messages;
}
