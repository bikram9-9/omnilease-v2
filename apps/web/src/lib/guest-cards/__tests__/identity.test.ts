import { describe, expect, it } from 'vitest';
import {
  buildGuestCardIdentity,
  compareGuestCardIdentity,
  normalizeEmail,
  normalizeName,
  normalizePhone,
} from '../identity';

describe('guest card identity helpers', () => {
  it('normalizes contact identity for duplicate keys', () => {
    expect(normalizeEmail('  Prospect@Example.COM ')).toBe('prospect@example.com');
    expect(normalizePhone('(512) 555-0199')).toBe('+15125550199');
    expect(normalizeName('  José   Rivera, Jr. ')).toBe('jose rivera jr');
  });

  it('builds channel external IDs without inventing missing identifiers', () => {
    expect(buildGuestCardIdentity({
      name: 'Avery Stone',
      email: 'avery@example.com',
      phone: '512.555.1000',
      channel: 'website',
      externalId: 'sess_123',
    })).toMatchObject({
      fullName: 'Avery Stone',
      normalizedEmail: 'avery@example.com',
      normalizedPhone: '+15125551000',
      normalizedName: 'avery stone',
      externalIds: { website: 'sess_123' },
    });
  });

  it('scores exact contact matches above safe fuzzy name matches', () => {
    expect(compareGuestCardIdentity(
      { normalizedEmail: 'a@example.com', normalizedName: 'avery stone' },
      { normalizedEmail: 'a@example.com', normalizedName: 'avery stone' },
    )).toEqual({ reasons: ['email', 'name'], confidence: 0.98 });

    expect(compareGuestCardIdentity(
      { normalizedName: 'avery stone' },
      { normalizedName: 'avery stone' },
    )).toEqual({ reasons: ['name'], confidence: 0.58 });
  });
});
