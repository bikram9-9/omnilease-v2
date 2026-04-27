import { describe, expect, it } from 'vitest';
import { getTourAvailability, type CalendarAvailabilityProvider } from '../tour-availability';
import { defaultTourSettings } from '../tour-settings';

const mondaySettings = {
  ...defaultTourSettings,
  calendarProvider: 'google_calendar' as const,
  calendarId: 'leasing@example.com',
  defaultDurationMinutes: 30,
  bufferMinutes: 0,
  schedulingWindowDays: 7,
  tourHours: { mon: { open: '09:00', close: '11:00' } },
};

describe('tour availability', () => {
  it('removes slots that overlap provider busy events', async () => {
    const provider: CalendarAvailabilityProvider = {
      async getBusyIntervals() {
        return [{
          start: new Date('2026-04-27T14:10:00.000Z'),
          end: new Date('2026-04-27T14:20:00.000Z'),
        }];
      },
    };

    const result = await getTourAvailability(mondaySettings, {
      timezone: 'America/Chicago',
      startDate: '2026-04-27',
      endDate: '2026-04-27',
      now: new Date('2026-04-25T12:00:00.000Z'),
      provider,
    });

    expect(result.status).toMatchObject({ source: 'provider', status: 'available' });
    expect(result.slots.map((slot) => `${slot.startTime}-${slot.endTime}`)).toEqual([
      '09:30-10:00',
      '10:00-10:30',
      '10:30-11:00',
    ]);
  });

  it('falls back to generated slots when Google Calendar is missing a calendar id', async () => {
    const result = await getTourAvailability(
      { ...mondaySettings, calendarId: null },
      {
        timezone: 'America/Chicago',
        startDate: '2026-04-27',
        endDate: '2026-04-27',
        now: new Date('2026-04-25T12:00:00.000Z'),
      },
    );

    expect(result.status).toMatchObject({
      source: 'settings_fallback',
      status: 'configuration_error',
      error: 'Missing calendar ID',
    });
    expect(result.slots).toHaveLength(4);
  });

  it('falls back to generated slots when the provider lookup fails', async () => {
    const provider: CalendarAvailabilityProvider = {
      async getBusyIntervals() {
        throw new Error('invalid_grant');
      },
    };

    const result = await getTourAvailability(mondaySettings, {
      timezone: 'America/Chicago',
      startDate: '2026-04-27',
      endDate: '2026-04-27',
      now: new Date('2026-04-25T12:00:00.000Z'),
      provider,
    });

    expect(result.status).toMatchObject({
      source: 'settings_fallback',
      status: 'provider_error',
      error: 'invalid_grant',
    });
    expect(result.slots.map((slot) => slot.startTime)).toEqual(['09:00', '09:30', '10:00', '10:30']);
  });
});
