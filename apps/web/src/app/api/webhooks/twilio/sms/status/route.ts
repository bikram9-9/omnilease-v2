import type { NextRequest } from 'next/server';
import { verifyTwilioSignature } from '@/lib/twilio/verify';

export async function POST(req: NextRequest): Promise<Response> {
  const rawBody = await req.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(rawBody)) {
    params[k] = v;
  }

  const appUrl = process.env.APP_URL ?? '';
  const url = appUrl.replace(/\/$/, '') + '/api/webhooks/twilio/sms/status';

  const signature = req.headers.get('x-twilio-signature') ?? '';
  if (!verifyTwilioSignature({ signature, url, params })) {
    return new Response('Forbidden', { status: 403 });
  }

  // MessageSid, MessageStatus (queued|sent|delivered|failed|undelivered), ErrorCode
  console.log('[twilio/sms/status]', {
    sid: params.MessageSid,
    status: params.MessageStatus,
    errorCode: params.ErrorCode,
  });

  return new Response('', { status: 200 });
}
