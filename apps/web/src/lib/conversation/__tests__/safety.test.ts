import { describe, it, expect } from 'vitest';
import { applySafetyFilter } from '../safety';

describe('applySafetyFilter', () => {
  it('passes through a clean response untouched', () => {
    const out = applySafetyFilter('We have a 1BR available for $1,800/mo. Want to schedule a tour?');
    expect(out.text).toBe('We have a 1BR available for $1,800/mo. Want to schedule a tour?');
    expect(out.flagged).toBe(false);
    expect(out.autoEscalate).toBe(false);
  });

  it('flags fair-housing-loaded phrases and swaps in a neutral fallback', () => {
    const out = applySafetyFilter("It's a family-friendly community with great schools.");
    expect(out.flagged).toBe(true);
    expect(out.text).not.toContain('family-friendly');
    expect(out.text.length).toBeGreaterThan(0);
  });

  it('strips SSN-like sequences', () => {
    const out = applySafetyFilter('Your application ID is 123-45-6789.');
    expect(out.text).not.toMatch(/\d{3}-\d{2}-\d{4}/);
    expect(out.flagged).toBe(true);
  });

  it('strips credit-card-like sequences', () => {
    const out = applySafetyFilter('Card 4111 1111 1111 1111 processed.');
    expect(out.text).not.toMatch(/\b4111\b/);
    expect(out.flagged).toBe(true);
  });

  it('auto-escalates when the response is unusually hedged', () => {
    const out = applySafetyFilter("I'm not sure. I think maybe it might be $1500? I don't really know.");
    expect(out.autoEscalate).toBe(true);
    expect(out.confidence).toBeLessThan(0.7);
  });

  it('does not auto-escalate for a confident answer', () => {
    const out = applySafetyFilter('The deposit is $500 and the application fee is $50.');
    expect(out.autoEscalate).toBe(false);
    expect(out.confidence).toBeGreaterThanOrEqual(0.7);
  });
});
