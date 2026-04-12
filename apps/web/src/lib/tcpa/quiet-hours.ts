/**
 * TCPA quiet hours: no unsolicited messaging between 9pm and 8am local time.
 * "Local" means the property's configured timezone.
 *
 * Direct replies (within ~15 minutes of an inbound) are exempt under TCPA
 * because they're responses to an active conversation, not unsolicited outreach.
 */

const QUIET_START_HOUR = 21; // 9pm (inclusive)
const QUIET_END_HOUR = 8;    // 8am (exclusive)
const DIRECT_REPLY_WINDOW_MS = 15 * 60 * 1000;

/**
 * Returns the hour (0 through 23) of `date` as observed in `timeZone`.
 * Uses Intl.DateTimeFormat for correct DST handling.
 */
function localHour(date: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  });
  // Intl may format "24" for midnight in some locales — coerce to 0.
  const hourStr = fmt.format(date);
  const hour = Number(hourStr);
  return hour === 24 ? 0 : hour;
}

/**
 * True if the current time falls within quiet hours (9pm–8am) in the given
 * property timezone. Inclusive of 9pm, exclusive of 8am.
 */
export function isWithinQuietHours(timeZone: string, now: Date = new Date()): boolean {
  const hour = localHour(now, timeZone);
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/**
 * True if the last inbound message was recent enough to make a reply count
 * as a direct-conversation response rather than an unsolicited outbound.
 * Direct replies bypass quiet-hours enforcement.
 */
export function isDirectReplyWindow(lastInboundAt: Date | null, now: Date = new Date()): boolean {
  if (!lastInboundAt) return false;
  const delta = now.getTime() - lastInboundAt.getTime();
  return delta >= 0 && delta <= DIRECT_REPLY_WINDOW_MS;
}
