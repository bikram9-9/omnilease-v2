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
});
