import { describe, it, expect } from 'vitest';
import { classifyIntent, INTENTS, type Intent } from '../intent';

describe('classifyIntent', () => {
  const cases: Array<[string, Intent]> = [
    ['How much is rent?', 'pricing'],
    ['whats the price of a 1 bedroom', 'pricing'],
    ['Do you allow dogs? I have a 60lb golden', 'pets'],
    ['pet policy?', 'pets'],
    ['Is there parking?', 'parking'],
    ['Do you have a gym', 'amenities'],
    ['can I tour the apartment this weekend', 'tour'],
    ['schedule a visit', 'tour'],
    ['how do i apply', 'application'],
    ['what do you have available in june', 'availability'],
    ['this is unacceptable, I want to speak to a manager', 'complaint'],
    ['can someone call me back', 'other'],
  ];

  for (const [input, expected] of cases) {
    it(`classifies "${input}" as ${expected}`, () => {
      expect(classifyIntent(input)).toBe(expected);
    });
  }

  it('exports the intent enum for analytics', () => {
    expect(INTENTS).toContain('pricing');
    expect(INTENTS).toContain('other');
  });

  it('is case-insensitive', () => {
    expect(classifyIntent('PRICE?')).toBe('pricing');
  });
});
