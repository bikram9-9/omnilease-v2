import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the twilio client factory at the module boundary — we don't want to
// hit the real twilio SDK (no auth in tests, no real network).
const messagesCreateMock = vi.hoisted(() => vi.fn());
vi.mock('../client', () => ({
  getTwilioClient: () => ({
    messages: { create: messagesCreateMock },
  }),
  __resetTwilioClient: () => {},
}));

// Also mock the tcpa guards so we can control their return values per test.
const isOptedOutMock = vi.hoisted(() => vi.fn());
const isWithinQuietHoursMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/tcpa/opt-outs', () => ({
  isOptedOut: isOptedOutMock,
  isStopKeyword: (s: string) => s.trim().toUpperCase() === 'STOP',
  markOptedOut: vi.fn(),
}));
vi.mock('@/lib/tcpa/quiet-hours', () => ({
  isWithinQuietHours: isWithinQuietHoursMock,
  isDirectReplyWindow: () => false,
}));

import { sendSms, OptedOutError, QuietHoursError } from '../send';

describe('sendSms', () => {
  beforeEach(() => {
    messagesCreateMock.mockReset();
    isOptedOutMock.mockReset();
    isWithinQuietHoursMock.mockReset();
    messagesCreateMock.mockResolvedValue({ sid: 'SM_fake' });
    isOptedOutMock.mockResolvedValue(false);
    isWithinQuietHoursMock.mockReturnValue(false);
  });

  const baseArgs = {
    propertyId: 'prop_1',
    propertyTimezone: 'America/Chicago',
    from: '+15550000000',
    to: '+15551234567',
    body: 'Hello',
    directReply: false,
  };

  it('sends the message when not opted out and outside quiet hours', async () => {
    await sendSms(baseArgs);
    expect(messagesCreateMock).toHaveBeenCalledTimes(1);
    const call = messagesCreateMock.mock.calls[0][0];
    expect(call.from).toBe('+15550000000');
    expect(call.to).toBe('+15551234567');
    expect(call.body).toBe('Hello');
  });

  it('throws OptedOutError without calling Twilio if the recipient has opted out', async () => {
    isOptedOutMock.mockResolvedValue(true);
    await expect(sendSms(baseArgs)).rejects.toBeInstanceOf(OptedOutError);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('throws QuietHoursError when outside quiet hours is false AND not a direct reply', async () => {
    isWithinQuietHoursMock.mockReturnValue(true);
    await expect(sendSms(baseArgs)).rejects.toBeInstanceOf(QuietHoursError);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('sends during quiet hours when directReply=true', async () => {
    isWithinQuietHoursMock.mockReturnValue(true);
    await sendSms({ ...baseArgs, directReply: true });
    expect(messagesCreateMock).toHaveBeenCalledTimes(1);
  });

  it('propagates Twilio SDK errors', async () => {
    messagesCreateMock.mockRejectedValue(new Error('rate_limited'));
    await expect(sendSms(baseArgs)).rejects.toThrow(/rate_limited/);
  });
});
