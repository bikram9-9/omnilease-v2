import { describe, it, expect } from 'vitest';
import { propertyInput } from './validators';

describe('propertyInput', () => {
  it('accepts minimal valid input', () => {
    expect(propertyInput.parse({ name: 'The Meridian' })).toMatchObject({
      name: 'The Meridian',
      timezone: 'America/New_York',
    });
  });

  it('rejects empty name', () => {
    expect(() => propertyInput.parse({ name: '' })).toThrow();
  });

  it('rejects state longer than 2 chars', () => {
    expect(() => propertyInput.parse({ name: 'x', state: 'California' })).toThrow();
  });

  it('rejects invalid escalation email', () => {
    expect(() => propertyInput.parse({ name: 'x', escalationEmail: 'not-an-email' })).toThrow();
  });

  it('accepts widget disclosure, privacy, and contact fallback fields', () => {
    expect(propertyInput.parse({
      name: 'The Meridian',
      aiDisclosure: 'I am the AI leasing assistant for The Meridian.',
      privacyNoticeUrl: 'https://example.com/privacy',
      termsUrl: 'https://example.com/terms',
      privacyDisclosureText: 'Your chat may be processed by leasing technology providers.',
      contactFallbackLabel: 'Call leasing',
      contactFallbackUrl: 'tel:+15551234567',
      contactFallbackText: 'Call our leasing office at 555-123-4567.',
    })).toMatchObject({
      aiDisclosure: 'I am the AI leasing assistant for The Meridian.',
      privacyNoticeUrl: 'https://example.com/privacy',
      contactFallbackText: 'Call our leasing office at 555-123-4567.',
    });
  });

  it('rejects invalid privacy and terms URLs', () => {
    expect(() => propertyInput.parse({ name: 'x', privacyNoticeUrl: 'privacy' })).toThrow();
    expect(() => propertyInput.parse({ name: 'x', termsUrl: 'terms' })).toThrow();
  });
});
