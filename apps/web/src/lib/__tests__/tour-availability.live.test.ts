import { describe, expect, it } from 'vitest';
import { getTourAvailability } from '../tour-availability';
import { defaultTourSettings } from '../tour-settings';

const runLiveE2E = process.env.RUN_GOOGLE_CALENDAR_LIVE_E2E === '1';
const requiredEnv = [
  'GOOGLE_CALENDAR_CLIENT_ID',
  'GOOGLE_CALENDAR_CLIENT_SECRET',
  'GOOGLE_CALENDAR_REFRESH_TOKEN',
] as const;

describe.skipIf(!runLiveE2E)('tour availability Google Calendar live E2E', () => {
  it('fetches real Google Calendar free/busy data and returns provider-backed slots', async () => {
    for (const key of requiredEnv) {
      expect(process.env[key], `${key} must be set`).toBeTruthy();
    }

    const result = await getTourAvailability(
      {
        ...defaultTourSettings,
        calendarProvider: 'google_calendar',
        calendarId: process.env.GOOGLE_CALENDAR_ID ?? 'primary',
        defaultDurationMinutes: 60,
        bufferMinutes: 0,
        schedulingWindowDays: 7,
        tourHours: {
          mon: { open: '09:00', close: '17:00' },
          tue: { open: '09:00', close: '17:00' },
          wed: { open: '09:00', close: '17:00' },
          thu: { open: '09:00', close: '17:00' },
          fri: { open: '09:00', close: '17:00' },
        },
      },
      {
        timezone: 'America/Chicago',
        startDate: process.env.GOOGLE_CALENDAR_E2E_START_DATE,
        endDate: process.env.GOOGLE_CALENDAR_E2E_END_DATE,
        now: new Date(process.env.GOOGLE_CALENDAR_E2E_NOW ?? '2026-04-26T12:00:00.000Z'),
      },
    );

    expect(result.status).toMatchObject({
      provider: 'google_calendar',
      source: 'provider',
      status: 'available',
      error: null,
    });
    if (
      process.env.GOOGLE_CALENDAR_E2E_EXPECT_BLOCKED_DATE &&
      process.env.GOOGLE_CALENDAR_E2E_EXPECT_BLOCKED_START_TIME
    ) {
      expect(result.slots.map((slot) => `${slot.date} ${slot.startTime}`)).not.toContain(
        `${process.env.GOOGLE_CALENDAR_E2E_EXPECT_BLOCKED_DATE} ${process.env.GOOGLE_CALENDAR_E2E_EXPECT_BLOCKED_START_TIME}`,
      );
    }
    expect(result.slots.length).toBeGreaterThan(0);
  });
});
