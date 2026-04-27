const OPT_OUT_RE = /^(stop|stopall|unsubscribe|cancel|end|quit)$/i;
const SUPPRESSED_STATUSES = new Set([
  'opt_out',
  'opted_out',
  'unsubscribed',
  'suppressed',
  'denied',
  'revoked',
]);
const ACTIVE_CONSENT_STATUSES = new Set([
  'subscribed',
  'opt_in',
  'opted_in',
  'consented',
  'active',
  'yes',
]);

export const OUTREACH_QUIET_HOURS = {
  startHour: 21,
  endHour: 8,
};

export const MAX_PROSPECT_SENDS_PER_24H = 2;

type ConsentSnapshot = {
  emailConsentStatus?: string | null;
  smsConsentStatus?: string | null;
  marketingConsentStatus?: string | null;
} | null;

type ConversationSnapshot = {
  status?: string | null;
  automationState?: string | null;
} | null;

export type OutreachSafetyInput = {
  recipientKind: 'prospect' | 'leasing_team' | 'dashboard_task';
  channel: 'email' | 'dashboard_task';
  now: Date;
  propertyTimezone: string;
  guestCard: ConsentSnapshot;
  conversation: ConversationSnapshot;
  recentProspectSendCount?: number;
};

export type OutreachSafetyDecision =
  | { ok: true }
  | { ok: false; reason: string };

export function classifyOptOutMessage(text: string): boolean {
  return OPT_OUT_RE.test(text.trim());
}

export function evaluateOutreachSafety(input: OutreachSafetyInput): OutreachSafetyDecision {
  if (input.conversation?.status === 'closed') {
    return { ok: false, reason: 'Conversation is closed.' };
  }

  if (input.conversation?.automationState === 'human_takeover') {
    return { ok: false, reason: 'Conversation is in human takeover.' };
  }

  if (input.recipientKind === 'leasing_team') {
    return { ok: true };
  }

  if (isSuppressed(input.guestCard)) {
    return { ok: false, reason: 'Prospect is opted out or suppressed for proactive outreach.' };
  }

  if (input.channel === 'email' && !hasActiveConsent(input.guestCard?.emailConsentStatus)) {
    return { ok: false, reason: 'Prospect email consent is not active.' };
  }

  if (input.recipientKind === 'prospect' && isQuietHours(input.now, input.propertyTimezone)) {
    return { ok: false, reason: 'Quiet hours are active for the property timezone.' };
  }

  if (input.recipientKind === 'prospect' && (input.recentProspectSendCount ?? 0) >= MAX_PROSPECT_SENDS_PER_24H) {
    return { ok: false, reason: 'Prospect outreach frequency cap reached for the last 24 hours.' };
  }

  return { ok: true };
}

export function isSuppressed(guestCard: ConsentSnapshot): boolean {
  const statuses = [
    guestCard?.emailConsentStatus,
    guestCard?.smsConsentStatus,
    guestCard?.marketingConsentStatus,
  ].map(normalizeStatus);
  return statuses.some((status) => status ? SUPPRESSED_STATUSES.has(status) : false);
}

export function hasActiveConsent(status: string | null | undefined): boolean {
  const normalized = normalizeStatus(status);
  return normalized ? ACTIVE_CONSENT_STATUSES.has(normalized) : false;
}

function isQuietHours(now: Date, timezone: string): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  return hour >= OUTREACH_QUIET_HOURS.startHour || hour < OUTREACH_QUIET_HOURS.endHour;
}

function normalizeStatus(status: string | null | undefined): string | null {
  if (!status) return null;
  return status.toLowerCase().trim().replace(/[-\s]+/g, '_');
}
