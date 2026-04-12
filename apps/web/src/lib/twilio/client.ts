import twilio, { type Twilio } from 'twilio';

let cached: Twilio | null = null;

/**
 * Lazy-initialised Twilio client. We instantiate on first use so that code
 * paths that never touch Twilio (e.g. widget-only requests, unit tests
 * mocking at the `sendSms` boundary) don't need TWILIO_* env vars set.
 */
export function getTwilioClient(): Twilio {
  if (cached) return cached;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid) throw new Error('TWILIO_ACCOUNT_SID is not set');
  if (!token) throw new Error('TWILIO_AUTH_TOKEN is not set');
  cached = twilio(sid, token);
  return cached;
}

/**
 * Reset the cached client — only call from tests between mock swaps.
 */
export function __resetTwilioClient(): void {
  cached = null;
}
