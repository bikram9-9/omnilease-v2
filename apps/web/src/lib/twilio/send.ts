import { getTwilioClient } from './client';
import { isOptedOut } from '@/lib/tcpa/opt-outs';
import { isWithinQuietHours } from '@/lib/tcpa/quiet-hours';

export class OptedOutError extends Error {
  constructor(phone: string) {
    super(`Recipient ${phone} has opted out of SMS`);
    this.name = 'OptedOutError';
  }
}

export class QuietHoursError extends Error {
  constructor(timezone: string) {
    super(`Send blocked by quiet hours in ${timezone}`);
    this.name = 'QuietHoursError';
  }
}

export type SendSmsInput = {
  propertyId: string;
  propertyTimezone: string;
  from: string;               // property's Twilio phone (E.164)
  to: string;                 // prospect phone (E.164)
  body: string;
  directReply: boolean;       // true = within 15 min of an inbound, bypasses quiet hours
};

/**
 * Send an SMS via Twilio, guarded by TCPA opt-out and quiet-hours checks.
 *
 * Throws OptedOutError or QuietHoursError without calling Twilio when the
 * send is blocked. Callers should catch these and log — the call site
 * decides whether to surface the failure to the user.
 */
export async function sendSms(input: SendSmsInput): Promise<void> {
  if (await isOptedOut(input.propertyId, input.to)) {
    throw new OptedOutError(input.to);
  }

  if (!input.directReply && isWithinQuietHours(input.propertyTimezone)) {
    throw new QuietHoursError(input.propertyTimezone);
  }

  const client = getTwilioClient();
  await client.messages.create({
    from: input.from,
    to: input.to,
    body: input.body,
  });
}
