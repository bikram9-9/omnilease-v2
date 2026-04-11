import { Resend } from 'resend';

export type SendEscalationEmailInput = {
  to: string;
  propertyName: string;
  prospectLabel: string;   // phone, email, or name
  reason: string;
  conversationUrl: string;
};

let cached: Resend | null = null;

function getClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error('RESEND_API_KEY is not set');
  }
  if (!cached) cached = new Resend(key);
  return cached;
}

export async function sendEscalationEmail(input: SendEscalationEmailInput): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error('RESEND_FROM_EMAIL is not set');

  const subject = `[${input.propertyName}] New escalation — ${input.reason}`;
  const text = [
    `A conversation at ${input.propertyName} was escalated to a human.`,
    '',
    `Prospect: ${input.prospectLabel}`,
    `Reason:   ${input.reason}`,
    '',
    `Open the conversation: ${input.conversationUrl}`,
    '',
    '— Omnilease',
  ].join('\n');

  const client = getClient();
  const { error } = await client.emails.send({
    from,
    to: input.to,
    subject,
    text,
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}
