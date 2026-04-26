'use server';

import { revalidatePath } from 'next/cache';
import { requireOrg } from '@/lib/auth';
import {
  sendHumanReplyForOrg,
  setConversationAutomationForOrg,
  type ConversationAutomationAction,
} from '@/lib/conversation/takeover';

export async function sendHumanReplyAction(formData: FormData) {
  const { orgId, userId } = await requireOrg();
  const conversationId = readRequiredString(formData, 'conversationId');
  const content = readRequiredString(formData, 'content');

  await sendHumanReplyForOrg({
    orgId,
    userId,
    conversationId,
    content,
  });

  revalidatePath(`/conversations/${conversationId}`);
  revalidatePath('/conversations');
}

export async function updateConversationAutomationAction(formData: FormData) {
  const { orgId, userId } = await requireOrg();
  const conversationId = readRequiredString(formData, 'conversationId');
  const action = readRequiredString(formData, 'action') as ConversationAutomationAction;

  if (!['take_over', 'return_to_ai', 'close', 'convert'].includes(action)) {
    throw new Error('Unknown conversation action');
  }

  await setConversationAutomationForOrg({
    orgId,
    userId,
    conversationId,
    action,
  });

  revalidatePath(`/conversations/${conversationId}`);
  revalidatePath('/conversations');
}

function readRequiredString(formData: FormData, key: string): string {
  const value = String(formData.get(key) ?? '').trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}
