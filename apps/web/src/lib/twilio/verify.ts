import { createHmac, timingSafeEqual } from 'node:crypto';

export type VerifyInput = {
  signature: string;            // X-Twilio-Signature header value
  url: string;                  // fully-qualified request URL (scheme + host + path + query)
  params: Record<string, string>; // application/x-www-form-urlencoded body params
};

/**
 * Verify that an inbound Twilio webhook was signed with our TWILIO_AUTH_TOKEN.
 *
 * Algorithm (per Twilio docs):
 *   signature = base64( HMAC-SHA1( authToken, url + sortedParamConcat ) )
 *   where sortedParamConcat = params sorted by key, concatenated as `${k}${v}`
 *
 * Throws if TWILIO_AUTH_TOKEN is missing from the environment (not a runtime
 * "return false" — a missing token is a misconfiguration, not a failed
 * verification).
 */
export function verifyTwilioSignature(input: VerifyInput): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) throw new Error('TWILIO_AUTH_TOKEN is not set');

  const sortedKeys = Object.keys(input.params).sort();
  const concat = input.url + sortedKeys.map((k) => `${k}${input.params[k]}`).join('');

  const expected = createHmac('sha1', token).update(concat).digest('base64');

  // Constant-time comparison to avoid timing oracle attacks.
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
