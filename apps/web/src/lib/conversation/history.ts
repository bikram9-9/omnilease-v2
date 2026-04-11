import { db, eq, desc } from '@omnilease/db';
import { messages } from '@omnilease/db';

export type HistoryTurn = {
  role: 'user' | 'assistant';
  content: string;
};

/**
 * Load the last `limit` turns of a conversation in chronological order,
 * shaped for AI SDK `convertToModelMessages`. System messages are filtered
 * out because the system prompt is rebuilt per-call.
 */
export async function loadHistory(
  conversationId: string,
  limit = 20,
): Promise<HistoryTurn[]> {
  const rows = await db
    .select({
      role: messages.role,
      content: messages.content,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return rows
    .reverse()
    .filter((r) => r.role === 'user' || r.role === 'assistant')
    .map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }));
}
