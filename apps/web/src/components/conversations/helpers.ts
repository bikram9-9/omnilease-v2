import type {
  ConversationAutomationState,
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

export function getAutomationStateLabel(state: ConversationAutomationState): string {
  switch (state) {
    case 'ai_active':
      return 'AI active';
    case 'human_takeover':
      return 'Human takeover';
  }
}

export function getAutomationStateClasses(state: ConversationAutomationState): string {
  switch (state) {
    case 'ai_active':
      return 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200';
    case 'human_takeover':
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

export function formatEscalationAge(value: Date | string, now = new Date()): string {
  const createdAt = typeof value === 'string' ? new Date(value) : value;
  const minutes = Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 60000));
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours === 0 ? `${days}d` : `${days}d ${remainingHours}h`;
}

export function getEscalationSlaLabel(
  priority: EscalationPriority,
  createdAt: Date | string,
  resolvedAt?: Date | string | null,
): string {
  if (resolvedAt) return 'Resolved';

  const age = formatEscalationAge(createdAt);
  const targetMinutes = getEscalationTargetMinutes(priority);
  const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - created.getTime()) / 60000));
  const target = targetMinutes < 60 ? `${targetMinutes}m` : `${Math.floor(targetMinutes / 60)}h`;

  return elapsedMinutes > targetMinutes
    ? `SLA overdue ${age}`
    : `SLA ${age} / ${target}`;
}

export function getEscalationSlaClasses(
  priority: EscalationPriority,
  createdAt: Date | string,
  resolvedAt?: Date | string | null,
): string {
  if (resolvedAt) return 'text-zinc-500';

  const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - created.getTime()) / 60000));
  if (elapsedMinutes > getEscalationTargetMinutes(priority)) return 'text-rose-300';
  if (priority === 'urgent' || priority === 'high') return 'text-orange-200';
  return 'text-zinc-400';
}

function getEscalationTargetMinutes(priority: EscalationPriority): number {
  switch (priority) {
    case 'urgent':
      return 15;
    case 'high':
      return 60;
    case 'normal':
      return 240;
    case 'low':
      return 1440;
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
