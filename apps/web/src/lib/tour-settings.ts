import type { CalendarProvider, OfficeHours, PropertyTourSettings, TourType } from '@omnilease/db';

export const tourTypeLabels: Record<TourType, string> = {
  in_person: 'In-person',
  virtual: 'Virtual',
  self_guided: 'Self-guided placeholder',
};

const tourTypes: TourType[] = ['in_person', 'virtual', 'self_guided'];
const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type DayKey = typeof dayKeys[number];

export type NormalizedTourSettings = {
  id?: string;
  propertyId?: string;
  enabledTourTypes: TourType[];
  defaultDurationMinutes: number;
  bufferMinutes: number;
  capacityPerSlot: number;
  schedulingWindowDays: number;
  tourHours: OfficeHours;
  blackoutDates: string[];
  calendarProvider: CalendarProvider;
  calendarId: string | null;
  calendarAuthStatus: 'not_configured' | 'configured' | 'error';
  calendarLastError: string | null;
  calendarLastCheckedAt?: Date | null;
  updatedAt?: Date;
};

export type TourSlot = {
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
  capacity: number;
  tourTypes: TourType[];
};

export const defaultTourHours: OfficeHours = {
  mon: { open: '09:00', close: '17:00' },
  tue: { open: '09:00', close: '17:00' },
  wed: { open: '09:00', close: '17:00' },
  thu: { open: '09:00', close: '17:00' },
  fri: { open: '09:00', close: '17:00' },
};

export const defaultTourSettings: NormalizedTourSettings = {
  enabledTourTypes: ['in_person'],
  defaultDurationMinutes: 30,
  bufferMinutes: 15,
  capacityPerSlot: 1,
  schedulingWindowDays: 14,
  tourHours: defaultTourHours,
  blackoutDates: [],
  calendarProvider: 'none',
  calendarId: null,
  calendarAuthStatus: 'not_configured',
  calendarLastError: null,
  calendarLastCheckedAt: null,
};

export function normalizeTourSettings(
  row: PropertyTourSettings | null | undefined,
): NormalizedTourSettings {
  if (!row) return defaultTourSettings;
  return {
    id: row.id,
    propertyId: row.propertyId,
    enabledTourTypes: validTourTypes(row.enabledTourTypes),
    defaultDurationMinutes: clampInteger(row.defaultDurationMinutes, 15, 240, 30),
    bufferMinutes: clampInteger(row.bufferMinutes, 0, 240, 15),
    capacityPerSlot: clampInteger(row.capacityPerSlot, 1, 25, 1),
    schedulingWindowDays: clampInteger(row.schedulingWindowDays, 1, 365, 14),
    tourHours: normalizeOfficeHours(row.tourHours),
    blackoutDates: normalizeBlackoutDates(row.blackoutDates),
    calendarProvider: normalizeCalendarProvider(row.calendarProvider),
    calendarId: normalizeCalendarId(row.calendarId),
    calendarAuthStatus: row.calendarAuthStatus ?? 'not_configured',
    calendarLastError: row.calendarLastError ?? null,
    calendarLastCheckedAt: row.calendarLastCheckedAt,
    updatedAt: row.updatedAt,
  };
}

export function parseTourSettingsForm(formData: FormData): NormalizedTourSettings {
  const selectedTypes = formData
    .getAll('tourTypes')
    .map((value) => String(value))
    .filter((value): value is TourType => tourTypes.includes(value as TourType));
  const calendarProvider = normalizeCalendarProvider(String(formData.get('calendarProvider') ?? 'none'));
  const calendarId = normalizeCalendarId(String(formData.get('calendarId') ?? ''));

  const tourHours = dayKeys.reduce<OfficeHours>((acc, day) => {
    if (formData.get(`${day}Enabled`) !== 'on') return acc;
    const open = String(formData.get(`${day}Open`) ?? '').trim();
    const close = String(formData.get(`${day}Close`) ?? '').trim();
    if (isTime(open) && isTime(close) && toMinutes(open) < toMinutes(close)) {
      acc[day] = { open, close };
    }
    return acc;
  }, {});

  return {
    enabledTourTypes: selectedTypes.length ? selectedTypes : ['in_person'],
    defaultDurationMinutes: clampInteger(
      Number(formData.get('defaultDurationMinutes')),
      15,
      240,
      30,
    ),
    bufferMinutes: clampInteger(Number(formData.get('bufferMinutes')), 0, 240, 15),
    capacityPerSlot: clampInteger(Number(formData.get('capacityPerSlot')), 1, 25, 1),
    schedulingWindowDays: clampInteger(
      Number(formData.get('schedulingWindowDays')),
      1,
      365,
      14,
    ),
    tourHours: Object.keys(tourHours).length ? tourHours : defaultTourHours,
    blackoutDates: normalizeBlackoutDates(
      String(formData.get('blackoutDates') ?? '')
        .split(/\r?\n|,/)
        .map((value) => value.trim()),
    ),
    calendarProvider,
    calendarId,
    calendarAuthStatus: calendarProvider === 'google_calendar' && calendarId
      ? 'configured'
      : 'not_configured',
    calendarLastError: null,
    calendarLastCheckedAt: null,
  };
}

export function validateTourSettings(settings: NormalizedTourSettings, timezone: string): string[] {
  const warnings: string[] = [];
  if (!isValidTimeZone(timezone)) warnings.push('Property timezone is invalid.');
  if (!settings.enabledTourTypes.length) warnings.push('At least one tour type must be enabled.');
  if (!Object.keys(settings.tourHours).length) warnings.push('At least one tour day must be enabled.');
  if (settings.calendarProvider === 'google_calendar' && !settings.calendarId) {
    warnings.push('Google Calendar ID is required before provider availability can be checked.');
  }

  for (const day of dayKeys) {
    const hours = settings.tourHours[day];
    if (!hours) continue;
    if (!isTime(hours.open) || !isTime(hours.close)) {
      warnings.push(`${day.toUpperCase()} tour hours must use HH:mm format.`);
    } else if (toMinutes(hours.open) >= toMinutes(hours.close)) {
      warnings.push(`${day.toUpperCase()} close time must be after open time.`);
    }
  }

  return warnings;
}

export function generateTourSlots(
  settings: NormalizedTourSettings,
  {
    timezone,
    startDate,
    endDate,
    now = new Date(),
  }: {
    timezone: string;
    startDate?: string;
    endDate?: string;
    now?: Date;
  },
): TourSlot[] {
  if (!isValidTimeZone(timezone)) return [];

  const today = localDateInTimeZone(now, timezone);
  const firstDate = startDate && startDate > today ? startDate : today;
  const lastAllowedDate = addDays(today, settings.schedulingWindowDays);
  const requestedEndDate = endDate ?? lastAllowedDate;
  const finalDate = requestedEndDate < lastAllowedDate ? requestedEndDate : lastAllowedDate;
  const slots: TourSlot[] = [];

  for (let date = firstDate; date <= finalDate; date = addDays(date, 1)) {
    if (settings.blackoutDates.includes(date)) continue;
    const hours = settings.tourHours[dayKeyForDate(date)];
    if (!hours) continue;

    const duration = settings.defaultDurationMinutes;
    const step = duration + settings.bufferMinutes;
    const close = toMinutes(hours.close);
    for (let start = toMinutes(hours.open); start + duration <= close; start += step) {
      slots.push({
        date,
        startTime: fromMinutes(start),
        endTime: fromMinutes(start + duration),
        timezone,
        capacity: settings.capacityPerSlot,
        tourTypes: settings.enabledTourTypes,
      });
    }
  }

  return slots;
}

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function validTourTypes(values: TourType[] | null | undefined): TourType[] {
  const filtered = (values ?? []).filter((value) => tourTypes.includes(value));
  return filtered.length ? filtered : ['in_person'];
}

function normalizeCalendarProvider(value: string | null | undefined): CalendarProvider {
  return value === 'google_calendar' ? 'google_calendar' : 'none';
}

function normalizeCalendarId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeOfficeHours(value: OfficeHours | null | undefined): OfficeHours {
  const source = value && Object.keys(value).length ? value : defaultTourHours;
  return dayKeys.reduce<OfficeHours>((acc, day) => {
    const hours = source[day];
    if (hours && isTime(hours.open) && isTime(hours.close) && toMinutes(hours.open) < toMinutes(hours.close)) {
      acc[day] = { open: hours.open, close: hours.close };
    }
    return acc;
  }, {});
}

function normalizeBlackoutDates(values: string[] | null | undefined): string[] {
  return Array.from(
    new Set((values ?? []).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))),
  ).sort();
}

function clampInteger(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function isTime(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(':').map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function toMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function fromMinutes(totalMinutes: number): string {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function localDateInTimeZone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function dayKeyForDate(date: string): DayKey {
  const [year, month, day] = date.split('-').map(Number);
  const index = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dayKeys[index === 0 ? 6 : index - 1];
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}
