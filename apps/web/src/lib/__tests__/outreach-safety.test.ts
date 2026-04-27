import { describe, expect, it } from 'vitest';
import {
  classifyOptOutMessage,
  evaluateOutreachSafety,
  hasActiveConsent,
  isSuppressed,
} from '../outreach-safety';

describe('outreach opt-out parsing', () => {
  it('recognizes STOP-style opt-out commands only when explicit', () => {
    expect(classifyOptOutMessage('STOP')).toBe(true);
    expect(classifyOptOutMessage(' unsubscribe ')).toBe(true);
    expect(classifyOptOutMessage('stop by tomorrow')).toBe(false);
  });
});

describe('outreach safety decisions', () => {
  it('requires active email consent for prospect email sends', () => {
    expect(hasActiveConsent('subscribed')).toBe(true);
    expect(hasActiveConsent('opted_out')).toBe(false);

    expect(evaluateOutreachSafety({
      recipientKind: 'prospect',
      channel: 'email',
      now: new Date('2026-04-27T15:00:00.000Z'),
      propertyTimezone: 'America/Chicago',
      guestCard: { emailConsentStatus: null },
      conversation: { status: 'active', automationState: 'ai_active' },
    })).toEqual({ ok: false, reason: 'Prospect email consent is not active.' });
  });

  it('blocks suppressed prospects, quiet hours, frequency caps, and human takeover', () => {
    expect(isSuppressed({ emailConsentStatus: 'opted-out' })).toBe(true);
    const base = {
      recipientKind: 'prospect' as const,
      channel: 'email' as const,
      propertyTimezone: 'America/Chicago',
      guestCard: { emailConsentStatus: 'subscribed' },
    };

    expect(evaluateOutreachSafety({
      ...base,
      now: new Date('2026-04-27T15:00:00.000Z'),
      conversation: { status: 'active', automationState: 'human_takeover' },
    }).ok).toBe(false);
    expect(evaluateOutreachSafety({
      ...base,
      now: new Date('2026-04-27T03:00:00.000Z'),
      conversation: { status: 'active', automationState: 'ai_active' },
    }).ok).toBe(false);
    expect(evaluateOutreachSafety({
      ...base,
      now: new Date('2026-04-27T15:00:00.000Z'),
      conversation: { status: 'active', automationState: 'ai_active' },
      recentProspectSendCount: 2,
    }).ok).toBe(false);
  });
});
