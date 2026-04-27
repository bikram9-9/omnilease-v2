import { describe, expect, it } from 'vitest';
import {
  evaluatePropertyReadiness,
  formatReadinessTestResults,
  parseReadinessTestResults,
} from '../readiness';

const baseProperty = {
  escalationEmail: 'leasing@example.com',
  aiDisclosure: 'I am an AI assistant for this property.',
  privacyNoticeUrl: 'https://example.com/privacy',
  privacyDisclosureText: null,
  contactFallbackLabel: 'Call leasing',
  contactFallbackUrl: null,
  contactFallbackText: null,
  websiteWidgetId: 'widget_123',
  launchMode: 'allowlist' as const,
  readinessTestResults: parseReadinessTestResults([
    'pricing | passed | conversation-1',
    'availability | passed | conversation-2',
    'fees | passed | conversation-3',
    'tours | passed | conversation-4',
    'human handoff | passed | conversation-5',
  ].join('\n'), new Date('2026-04-26T15:00:00.000Z')),
};

describe('property readiness', () => {
  it('passes when every blocker has evidence', () => {
    const readiness = evaluatePropertyReadiness({
      property: baseProperty,
      knowledgeSections: [{ section: 'overview', status: 'published', validationWarnings: [] }],
      assistantSettings: {
        primaryGoal: 'book_tour',
        ctaPreference: 'ask_for_tour',
        escalationTriggers: ['human request'],
      },
      tourSettings: {
        enabledTourTypes: ['in_person'],
        tourHours: { mon: { open: '09:00', close: '17:00' } },
        calendarProvider: 'none',
        calendarAuthStatus: 'not_configured',
        calendarLastCheckedAt: null,
        calendarLastError: null,
      },
      activeTourOwners: [{ id: 'owner-1' }],
    });

    expect(readiness.passed).toBe(true);
    expect(readiness.blockers).toHaveLength(0);
  });

  it('blocks missing human/privacy/disclosure/provider/test gates', () => {
    const readiness = evaluatePropertyReadiness({
      property: {
        ...baseProperty,
        escalationEmail: null,
        aiDisclosure: null,
        privacyNoticeUrl: null,
        contactFallbackLabel: null,
        readinessTestResults: [],
      },
      knowledgeSections: [],
      assistantSettings: null,
      tourSettings: {
        enabledTourTypes: ['in_person'],
        tourHours: {},
        calendarProvider: 'google_calendar',
        calendarAuthStatus: 'error',
        calendarLastCheckedAt: new Date('2026-04-26T15:00:00.000Z'),
        calendarLastError: 'OAuth expired',
      },
      activeTourOwners: [],
    });

    expect(readiness.passed).toBe(false);
    expect(readiness.blockers.map((item) => item.key)).toEqual(
      expect.arrayContaining([
        'escalation-contact',
        'ai-disclosure',
        'privacy-contact-fallback',
        'calendar-provider',
        'test-conversations',
      ]),
    );
  });

  it('round-trips validation script results', () => {
    const results = parseReadinessTestResults('pricing | passed | abc | ok');
    expect(results[0]).toMatchObject({
      area: 'pricing',
      status: 'passed',
      conversationId: 'abc',
      notes: 'ok',
    });
    expect(formatReadinessTestResults(results)).toContain('pricing | passed | abc | ok');
  });
});
