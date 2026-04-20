import nodemailer from 'nodemailer';
import { Resend } from 'resend';

export type SendEscalationEmailInput = {
  to: string;
  propertyName: string;
  prospectLabel: string;   // phone, email, or name
  reason: string;
  conversationUrl: string;
};

let cached: Resend | null = null;
let cachedSmtpTransport: nodemailer.Transporter | null = null;

function emailFromAddress(): string {
  const from = process.env.EMAIL_FROM ?? process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error('EMAIL_FROM or RESEND_FROM_EMAIL is not set');
  return from;
}

function getClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error('RESEND_API_KEY is not set');
  }
  if (!cached) cached = new Resend(key);
  return cached;
}

function getSmtpTransport(): nodemailer.Transporter {
  const host = process.env.SMTP_HOST;
  if (!host) {
    throw new Error('SMTP_HOST is not set');
  }

  if (!cachedSmtpTransport) {
    const port = Number(process.env.SMTP_PORT ?? '1025');
    const secure = process.env.SMTP_SECURE === 'true';
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    cachedSmtpTransport = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass: pass ?? '' } : undefined,
    });
  }

  return cachedSmtpTransport;
}

export async function sendEscalationEmail(input: SendEscalationEmailInput): Promise<void> {
  const from = emailFromAddress();

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

  if (process.env.SMTP_HOST) {
    const transport = getSmtpTransport();
    await transport.sendMail({
      from,
      to: input.to,
      subject,
      text,
    });
    return;
  }

  const client = getClient();
  const { error } = await client.emails.send({
    from,
    to: input.to,
    subject,
    text,
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}
