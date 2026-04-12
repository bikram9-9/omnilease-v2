import { describe, it, expect, afterEach, vi } from 'vitest';
import { isWithinQuietHours, isDirectReplyWindow } from '../quiet-hours';

/**
 * Freeze time to a specific UTC moment.
 */
function freezeTo(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe('isWithinQuietHours', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Quiet hours are 9pm-8am local. Property timezone = America/Chicago (UTC-5 during DST).
  // 2026-06-15 02:30 UTC = 2026-06-14 21:30 local → in quiet hours
  // 2026-06-15 10:30 UTC = 2026-06-15 05:30 local → in quiet hours
  // 2026-06-15 14:30 UTC = 2026-06-15 09:30 local → NOT in quiet hours
  // 2026-06-15 23:30 UTC = 2026-06-15 18:30 local → NOT in quiet hours
  // 2026-06-16 01:30 UTC = 2026-06-15 20:30 local → NOT in quiet hours (20:30 < 21:00)
  // 2026-06-16 02:00 UTC = 2026-06-15 21:00 local → in quiet hours (21:00 boundary inclusive)

  it('9:30pm local is within quiet hours', () => {
    freezeTo('2026-06-15T02:30:00Z');
    expect(isWithinQuietHours('America/Chicago')).toBe(true);
  });

  it('5:30am local is within quiet hours', () => {
    freezeTo('2026-06-15T10:30:00Z');
    expect(isWithinQuietHours('America/Chicago')).toBe(true);
  });

  it('9:30am local is NOT within quiet hours', () => {
    freezeTo('2026-06-15T14:30:00Z');
    expect(isWithinQuietHours('America/Chicago')).toBe(false);
  });

  it('6:30pm local is NOT within quiet hours', () => {
    freezeTo('2026-06-15T23:30:00Z');
    expect(isWithinQuietHours('America/Chicago')).toBe(false);
  });

  it('8:30pm local is NOT within quiet hours (before 9pm boundary)', () => {
    freezeTo('2026-06-16T01:30:00Z');
    expect(isWithinQuietHours('America/Chicago')).toBe(false);
  });

  it('9:00pm local IS within quiet hours (inclusive boundary)', () => {
    freezeTo('2026-06-16T02:00:00Z');
    expect(isWithinQuietHours('America/Chicago')).toBe(true);
  });

  it('handles a different timezone', () => {
    // 2026-06-15 14:30 UTC = 2026-06-15 10:30 America/New_York
    freezeTo('2026-06-15T14:30:00Z');
    expect(isWithinQuietHours('America/New_York')).toBe(false);
  });
});

describe('isDirectReplyWindow', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true if the last inbound was within the last 15 minutes', () => {
    freezeTo('2026-06-15T14:30:00Z');
    const fiveMinAgo = new Date('2026-06-15T14:25:00Z');
    expect(isDirectReplyWindow(fiveMinAgo)).toBe(true);
  });

  it('returns true at exactly 15 minutes', () => {
    freezeTo('2026-06-15T14:30:00Z');
    const fifteenMinAgo = new Date('2026-06-15T14:15:00Z');
    expect(isDirectReplyWindow(fifteenMinAgo)).toBe(true);
  });

  it('returns false if the last inbound was 16 minutes ago', () => {
    freezeTo('2026-06-15T14:30:00Z');
    const sixteenMinAgo = new Date('2026-06-15T14:14:00Z');
    expect(isDirectReplyWindow(sixteenMinAgo)).toBe(false);
  });

  it('returns false if lastInboundAt is null', () => {
    freezeTo('2026-06-15T14:30:00Z');
    expect(isDirectReplyWindow(null)).toBe(false);
  });
});
