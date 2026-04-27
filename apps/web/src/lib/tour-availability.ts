import type { CalendarProvider } from '@omnilease/db';
import {
  generateTourSlots,
  type NormalizedTourSettings,
  type TourSlot,
} from '@/lib/tour-settings';

export type BusyInterval = {
  start: Date;
  end: Date;
};

export type CalendarFreeBusyInput = {
  calendarId: string;
  timeMin: Date;
  timeMax: Date;
  timezone: string;
};

export type CalendarAvailabilityProvider = {
  getBusyIntervals(input: CalendarFreeBusyInput): Promise<BusyInterval[]>;
};

export type TourAvailabilityStatus =
  | 'not_configured'
  | 'configuration_error'
  | 'available'
  | 'provider_error';

export type TourAvailabilityResult = {
  slots: TourSlot[];
  status: {
    provider: CalendarProvider;
    source: 'settings_only' | 'provider' | 'settings_fallback';
    status: TourAvailabilityStatus;
    message: string;
    checkedAt: Date | null;
    error: string | null;
  };
};

type TourAvailabilityOptions = {
  timezone: string;
  startDate?: string;
  endDate?: string;
  now?: Date;
  provider?: CalendarAvailabilityProvider | null;
};

type GoogleCalendarEnv = {
  GOOGLE_CALENDAR_ACCESS_TOKEN?: string;
  GOOGLE_CALENDAR_CLIENT_ID?: string;
  GOOGLE_CALENDAR_CLIENT_SECRET?: string;
  GOOGLE_CALENDAR_REFRESH_TOKEN?: string;
  GOOGLE_WORKSPACE_CLI_TOKEN?: string;
};

type FetchLike = typeof fetch;

export async function getTourAvailability(
  settings: NormalizedTourSettings,
  options: TourAvailabilityOptions,
): Promise<TourAvailabilityResult> {
  const generatedSlots = generateTourSlots(settings, options);

  if (settings.calendarProvider === 'none') {
    return withStatus(generatedSlots, {
      provider: 'none',
      source: 'settings_only',
      status: 'not_configured',
      message: 'Calendar provider is not configured. Showing slots from tour settings.',
      checkedAt: null,
      error: null,
    });
  }

  if (!settings.calendarId) {
    return withStatus(generatedSlots, {
      provider: settings.calendarProvider,
      source: 'settings_fallback',
      status: 'configuration_error',
      message: 'Google Calendar is selected, but no calendar ID is configured.',
      checkedAt: null,
      error: 'Missing calendar ID',
    });
  }

  const provider = options.provider ?? createGoogleCalendarAvailabilityProvider();
  if (!provider) {
    return withStatus(generatedSlots, {
      provider: settings.calendarProvider,
      source: 'settings_fallback',
      status: 'configuration_error',
      message: 'Google Calendar OAuth is not configured. Showing slots from tour settings.',
      checkedAt: null,
      error: 'Missing Google Calendar OAuth credentials',
    });
  }

  if (generatedSlots.length === 0) {
    return withStatus(generatedSlots, {
      provider: settings.calendarProvider,
      source: 'provider',
      status: 'available',
      message: 'Google Calendar was configured, but no slots match the current tour settings.',
      checkedAt: new Date(),
      error: null,
    });
  }

  const { timeMin, timeMax } = availabilityRange(generatedSlots, options.timezone);

  try {
    const busyIntervals = await provider.getBusyIntervals({
      calendarId: settings.calendarId,
      timeMin,
      timeMax,
      timezone: options.timezone,
    });
    const availableSlots = generatedSlots.filter((slot) => {
      const interval = tourSlotToInterval(slot, options.timezone);
      return !busyIntervals.some((busy) => intervalsOverlap(interval, busy));
    });

    return withStatus(availableSlots, {
      provider: settings.calendarProvider,
      source: 'provider',
      status: 'available',
      message: 'Google Calendar free/busy is filtering offered tour slots.',
      checkedAt: new Date(),
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown provider error';
    return withStatus(generatedSlots, {
      provider: settings.calendarProvider,
      source: 'settings_fallback',
      status: 'provider_error',
      message: 'Google Calendar free/busy failed. Showing slots from tour settings.',
      checkedAt: new Date(),
      error: message,
    });
  }
}

export function createGoogleCalendarAvailabilityProvider(
  env: GoogleCalendarEnv = process.env as GoogleCalendarEnv,
  fetchImpl: FetchLike = fetch,
): CalendarAvailabilityProvider | null {
  if (!hasGoogleCalendarCredentials(env)) return null;

  return {
    async getBusyIntervals(input) {
      const accessToken = await getGoogleCalendarAccessToken(env, fetchImpl);
      const response = await fetchImpl('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          timeMin: input.timeMin.toISOString(),
          timeMax: input.timeMax.toISOString(),
          timeZone: input.timezone,
          items: [{ id: input.calendarId }],
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(providerErrorMessage(payload, `Google Calendar free/busy failed with ${response.status}`));
      }

      const calendar = payload?.calendars?.[input.calendarId];
      if (calendar?.errors?.length) {
        throw new Error(providerErrorMessage(calendar, 'Google Calendar returned a calendar error'));
      }

      return (calendar?.busy ?? []).flatMap((item: { start?: string; end?: string }) => {
        if (!item.start || !item.end) return [];
        return [{ start: new Date(item.start), end: new Date(item.end) }];
      });
    },
  };
}

function withStatus(
  slots: TourSlot[],
  status: TourAvailabilityResult['status'],
): TourAvailabilityResult {
  return { slots, status };
}

function hasGoogleCalendarCredentials(env: GoogleCalendarEnv): boolean {
  if (env.GOOGLE_CALENDAR_ACCESS_TOKEN || env.GOOGLE_WORKSPACE_CLI_TOKEN) return true;
  return Boolean(
    env.GOOGLE_CALENDAR_CLIENT_ID &&
      env.GOOGLE_CALENDAR_CLIENT_SECRET &&
      env.GOOGLE_CALENDAR_REFRESH_TOKEN,
  );
}

async function getGoogleCalendarAccessToken(
  env: GoogleCalendarEnv,
  fetchImpl: FetchLike,
): Promise<string> {
  if (env.GOOGLE_CALENDAR_ACCESS_TOKEN) return env.GOOGLE_CALENDAR_ACCESS_TOKEN;
  if (env.GOOGLE_WORKSPACE_CLI_TOKEN) return env.GOOGLE_WORKSPACE_CLI_TOKEN;

  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CALENDAR_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CALENDAR_CLIENT_SECRET ?? '',
      refresh_token: env.GOOGLE_CALENDAR_REFRESH_TOKEN ?? '',
      grant_type: 'refresh_token',
    }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload?.access_token) {
    throw new Error(providerErrorMessage(payload, 'Google Calendar OAuth token refresh failed'));
  }

  return String(payload.access_token);
}

function providerErrorMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    typeof payload.error === 'object' &&
    payload.error &&
    'message' in payload.error &&
    typeof payload.error.message === 'string'
  ) {
    return payload.error.message;
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'errors' in payload &&
    Array.isArray(payload.errors) &&
    typeof payload.errors[0]?.reason === 'string'
  ) {
    return payload.errors[0].reason;
  }

  return fallback;
}

function availabilityRange(slots: TourSlot[], timezone: string): { timeMin: Date; timeMax: Date } {
  const first = slots[0];
  const last = slots[slots.length - 1];
  return {
    timeMin: slotDate(first, first.startTime, timezone),
    timeMax: slotDate(last, last.endTime, timezone),
  };
}

export function tourSlotToInterval(slot: TourSlot, timezone: string): BusyInterval {
  return {
    start: slotDate(slot, slot.startTime, timezone),
    end: slotDate(slot, slot.endTime, timezone),
  };
}

function slotDate(slot: TourSlot, time: string, timezone: string): Date {
  const [year, month, day] = slot.date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return zonedLocalTimeToUtc({ year, month, day, hour, minute }, timezone);
}

function zonedLocalTimeToUtc(
  local: { year: number; month: number; day: number; hour: number; minute: number },
  timezone: string,
): Date {
  const guessedUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const actualLocal = localParts(new Date(guessedUtc), timezone);
  const intendedLocalUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const actualLocalUtc = Date.UTC(
    actualLocal.year,
    actualLocal.month - 1,
    actualLocal.day,
    actualLocal.hour,
    actualLocal.minute,
  );

  return new Date(guessedUtc + intendedLocalUtc - actualLocalUtc);
}

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function intervalsOverlap(a: BusyInterval, b: BusyInterval): boolean {
  return a.start < b.end && a.end > b.start;
}
