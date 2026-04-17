import type {
  ConversationChannel,
  ConversationStatus,
  EscalationPriority,
  MessageAuthorType,
} from '@omnilease/db';

export function formatConversationTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function getProspectLabel(input: {
  prospectName: string | null;
  prospectEmail: string | null;
  prospectPhone: string | null;
  channel: ConversationChannel;
  externalId?: string | null;
}): string {
  return (
    input.prospectName ??
    input.prospectEmail ??
    input.prospectPhone ??
    (input.channel === 'website' ? 'Website visitor' : input.externalId) ??
    'Unknown prospect'
  );
}

export function getChannelLabel(channel: ConversationChannel): string {
  switch (channel) {
    case 'website':
      return 'Website';
    case 'messenger':
      return 'Messenger';
    case 'phone':
      return 'Phone';
  }
}

export function getChannelClasses(channel: ConversationChannel): string {
  switch (channel) {
    case 'website':
      return 'border-sky-400/20 bg-sky-400/10 text-sky-200';
    case 'messenger':
      return 'border-indigo-400/20 bg-indigo-400/10 text-indigo-200';
    case 'phone':
      return 'border-amber-400/20 bg-amber-400/10 text-amber-200';
  }
}

export function getStatusLabel(status: ConversationStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'escalated':
      return 'Escalated';
    case 'closed':
      return 'Closed';
    case 'converted':
      return 'Converted';
  }
}

export function getStatusClasses(status: ConversationStatus): string {
  switch (status) {
    case 'active':
      return 'border-zinc-700 bg-zinc-800 text-zinc-200';
    case 'escalated':
      return 'border-rose-400/20 bg-rose-400/10 text-rose-200';
    case 'closed':
      return 'border-zinc-700 bg-zinc-900 text-zinc-400';
    case 'converted':
      return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200';
  }
}

export function getPriorityClasses(priority: EscalationPriority): string {
  switch (priority) {
    case 'urgent':
      return 'border-rose-400/20 bg-rose-400/10 text-rose-200';
    case 'high':
      return 'border-orange-400/20 bg-orange-400/10 text-orange-200';
    case 'normal':
      return 'border-amber-400/20 bg-amber-400/10 text-amber-200';
    case 'low':
      return 'border-zinc-700 bg-zinc-900 text-zinc-300';
  }
}

export function getAuthorLabel(authorType: MessageAuthorType): string {
  switch (authorType) {
    case 'prospect':
      return 'Prospect';
    case 'human_agent':
      return 'Agent';
    case 'ai':
      return 'AI';
  }
}

export function getAuthorBubbleClasses(authorType: MessageAuthorType): string {
  switch (authorType) {
    case 'prospect':
      return 'ml-auto border border-sky-400/20 bg-sky-400/10 text-sky-50';
    case 'human_agent':
      return 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-50';
    case 'ai':
      return 'border border-zinc-800 bg-zinc-900 text-zinc-100';
  }
}
