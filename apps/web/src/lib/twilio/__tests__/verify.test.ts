import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyTwilioSignature } from '../verify';

// Twilio computes the signature as:
//   HMAC-SHA1(authToken, url + sortedParamConcat)
// base64-encoded. We replicate that here so the test owns the crypto contract.
function signRequest(authToken: string, url: string, params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  const data = url + sortedKeys.map((k) => `${k}${params[k]}`).join('');
  return createHmac('sha1', authToken).update(data).digest('base64');
}

describe('verifyTwilioSignature', () => {
  const authToken = 'test_token';
  const url = 'https://app.example.com/api/webhooks/twilio/sms';
  const params = {
    From: '+15551234567',
    To: '+15557654321',
    Body: 'Hello',
    MessageSid: 'SM1234',
  };

  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = authToken;
    process.env.APP_URL = 'https://app.example.com';
  });

  it('accepts a correctly-signed request', () => {
    const signature = signRequest(authToken, url, params);
    expect(verifyTwilioSignature({ signature, url, params })).toBe(true);
  });

  it('rejects a request with a tampered body', () => {
    const signature = signRequest(authToken, url, params);
    const tampered = { ...params, Body: 'Different text' };
    expect(verifyTwilioSignature({ signature, url, params: tampered })).toBe(false);
  });

  it('rejects a request with a wrong auth token', () => {
    const signature = signRequest('other_token', url, params);
    expect(verifyTwilioSignature({ signature, url, params })).toBe(false);
  });

  it('rejects a request with a different URL', () => {
    const signature = signRequest(authToken, url, params);
    expect(
      verifyTwilioSignature({
        signature,
        url: 'https://app.example.com/api/webhooks/twilio/sms?extra=1',
        params,
      }),
    ).toBe(false);
  });

  it('throws if TWILIO_AUTH_TOKEN is not set', () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    expect(() =>
      verifyTwilioSignature({ signature: 'any', url, params }),
    ).toThrow(/TWILIO_AUTH_TOKEN/);
  });
});
