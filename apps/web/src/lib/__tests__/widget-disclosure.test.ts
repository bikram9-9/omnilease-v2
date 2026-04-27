import { describe, expect, it } from 'vitest';
import {
  buildWidgetDisclosureConfig,
  defaultAiDisclosure,
  getWidgetReleaseReadiness,
} from '../widget-disclosure';

describe('widget disclosure config', () => {
  it('builds an AI-first assistant greeting with property welcome copy', () => {
    const config = buildWidgetDisclosureConfig({
      name: 'Meridian Flats',
      aiDisclosure: 'I am the AI leasing assistant for Meridian Flats.',
      welcomeMessage: 'Ask me about tours and availability.',
      privacyNoticeUrl: 'https://example.com/privacy',
      termsUrl: 'https://example.com/terms',
      contactFallbackLabel: 'Call leasing',
      contactFallbackUrl: 'tel:+15551234567',
      contactFallbackText: 'Call our leasing office at 555-123-4567.',
    });

    expect(config.aiDisclosure).toBe('I am the AI leasing assistant for Meridian Flats.');
    expect(config.initialAssistantMessage).toContain('I am the AI leasing assistant');
    expect(config.initialAssistantMessage).toContain('Ask me about tours');
    expect(config.privacyNoticeUrl).toBe('https://example.com/privacy');
    expect(config.contactFallbackText).toContain('leasing office');
  });

  it('falls back to a clear AI disclosure for runtime safety', () => {
    const config = buildWidgetDisclosureConfig({ name: 'Meridian Flats' });

    expect(config.aiDisclosure).toBe(defaultAiDisclosure('Meridian Flats'));
    expect(config.initialAssistantMessage).toContain('AI assistant for Meridian Flats');
  });
});

describe('widget release readiness', () => {
  it('passes only when disclosure, privacy/terms, and human fallback are configured', () => {
    const readiness = getWidgetReleaseReadiness({
      name: 'Meridian Flats',
      aiDisclosure: 'I am the AI leasing assistant for Meridian Flats.',
      privacyNoticeUrl: 'https://example.com/privacy',
      contactFallbackText: 'Call leasing at 555-123-4567.',
    });

    expect(readiness.passed).toBe(true);
    expect(readiness.items.every((item) => item.passed)).toBe(true);
  });

  it('fails go-live readiness when disclosure or fallback contact is missing', () => {
    const readiness = getWidgetReleaseReadiness({
      name: 'Meridian Flats',
      privacyDisclosureText: 'Your chat may be processed by our leasing technology providers.',
    });

    expect(readiness.passed).toBe(false);
    expect(readiness.items.filter((item) => !item.passed).map((item) => item.key)).toEqual([
      'ai_disclosure',
      'contact_fallback',
    ]);
  });
});
