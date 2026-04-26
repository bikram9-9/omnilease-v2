import { describe, expect, it } from 'vitest';
import {
  defaultTourSettings,
  generateTourSlots,
  isValidTimeZone,
  parseTourSettingsForm,
  validateTourSettings,
} from '../tour-settings';

describe('tour settings', () => {
  it('generates slots using duration plus buffer', () => {
    const slots = generateTourSlots(
      {
        ...defaultTourSettings,
        defaultDurationMinutes: 30,
        bufferMinutes: 15,
        tourHours: { mon: { open: '09:00', close: '11:00' } },
      },
      {
        timezone: 'America/Chicago',
        startDate: '2026-04-27',
        endDate: '2026-04-27',
        now: new Date('2026-04-25T12:00:00.000Z'),
      },
    );

    expect(slots.map((slot) => `${slot.startTime}-${slot.endTime}`)).toEqual([
      '09:00-09:30',
      '09:45-10:15',
      '10:30-11:00',
    ]);
  });

  it('does not generate slots on blackout dates', () => {
    const slots = generateTourSlots(
      {
        ...defaultTourSettings,
        blackoutDates: ['2026-04-27'],
        tourHours: { mon: { open: '09:00', close: '11:00' } },
      },
      {
        timezone: 'America/Chicago',
        startDate: '2026-04-27',
        endDate: '2026-04-27',
        now: new Date('2026-04-25T12:00:00.000Z'),
      },
    );

    expect(slots).toEqual([]);
  });

  it('limits slots to the scheduling window in the property timezone', () => {
    const slots = generateTourSlots(
      {
        ...defaultTourSettings,
        schedulingWindowDays: 1,
        tourHours: {
          sat: { open: '09:00', close: '10:00' },
          sun: { open: '09:00', close: '10:00' },
          mon: { open: '09:00', close: '10:00' },
        },
      },
      {
        timezone: 'America/Chicago',
        startDate: '2026-04-25',
        endDate: '2026-04-27',
        now: new Date('2026-04-25T12:00:00.000Z'),
      },
    );

    expect(slots.map((slot) => slot.date)).toEqual(['2026-04-25', '2026-04-26']);
  });

  it('parses dashboard form values into normalized settings', () => {
    const formData = new FormData();
    formData.append('tourTypes', 'virtual');
    formData.append('defaultDurationMinutes', '45');
    formData.append('bufferMinutes', '10');
    formData.append('capacityPerSlot', '2');
    formData.append('schedulingWindowDays', '30');
    formData.append('monEnabled', 'on');
    formData.append('monOpen', '10:00');
    formData.append('monClose', '16:00');
    formData.append('blackoutDates', '2026-05-01\nnot-a-date,2026-05-02');

    expect(parseTourSettingsForm(formData)).toMatchObject({
      enabledTourTypes: ['virtual'],
      defaultDurationMinutes: 45,
      bufferMinutes: 10,
      capacityPerSlot: 2,
      schedulingWindowDays: 30,
      tourHours: { mon: { open: '10:00', close: '16:00' } },
      blackoutDates: ['2026-05-01', '2026-05-02'],
    });
  });

  it('validates property timezone and usable hours', () => {
    expect(isValidTimeZone('America/Chicago')).toBe(true);
    expect(validateTourSettings(defaultTourSettings, 'Not/AZone')).toContain(
      'Property timezone is invalid.',
    );
  });
});
