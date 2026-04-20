import { describe, it, expect, vi, beforeEach } from 'vitest';

// We mock the Resend module at the module boundary — the whole point of this
// thin wrapper is to make tests swap out the SDK without touching the rest
// of the codebase.
const sendMock = vi.fn();
const smtpSendMailMock = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: smtpSendMailMock,
    })),
  },
}));

describe('sendEscalationEmail', () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: 'msg_fake' }, error: null });
    smtpSendMailMock.mockReset();
    smtpSendMailMock.mockResolvedValue({ messageId: 'smtp_fake' });
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_SECURE;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.EMAIL_FROM;
    process.env.RESEND_API_KEY = 're_fake';
    process.env.RESEND_FROM_EMAIL = 'Omnilease <alerts@example.com>';
  });

  it('sends the escalation email with conversation context in the body', async () => {
    const { sendEscalationEmail } = await import('../resend');
    await sendEscalationEmail({
      to: 'manager@example.com',
      propertyName: 'Sunset Ridge',
      prospectLabel: '+15551234567',
      reason: 'Prospect asked to speak with a human',
      conversationUrl: 'https://app.example.com/conversations/abc-123',
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0][0];
    expect(arg.to).toBe('manager@example.com');
    expect(arg.from).toBe('Omnilease <alerts@example.com>');
    expect(arg.subject).toContain('Sunset Ridge');
    expect(arg.text).toContain('Prospect asked to speak with a human');
    expect(arg.text).toContain('https://app.example.com/conversations/abc-123');
    expect(arg.text).toContain('+15551234567');
  });

  it('uses SMTP when SMTP_HOST is configured', async () => {
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = '1025';
    process.env.EMAIL_FROM = 'Omnilease Local <alerts@example.com>';

    const { sendEscalationEmail } = await import('../resend');
    await sendEscalationEmail({
      to: 'manager@example.com',
      propertyName: 'Sunset Ridge',
      prospectLabel: '+15551234567',
      reason: 'Prospect asked to speak with a human',
      conversationUrl: 'https://app.example.com/conversations/abc-123',
    });

    expect(smtpSendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMock).not.toHaveBeenCalled();
    const arg = smtpSendMailMock.mock.calls[0][0];
    expect(arg.from).toBe('Omnilease Local <alerts@example.com>');
    expect(arg.to).toBe('manager@example.com');
    expect(arg.subject).toContain('Sunset Ridge');
  });

  it('throws if RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY;
    vi.resetModules();
    const { sendEscalationEmail } = await import('../resend');
    await expect(
      sendEscalationEmail({
        to: 'x@example.com',
        propertyName: 'P',
        prospectLabel: 'p',
        reason: 'r',
        conversationUrl: 'u',
      }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });

  it('propagates Resend errors', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'rate_limited' } });
    const { sendEscalationEmail } = await import('../resend');
    await expect(
      sendEscalationEmail({
        to: 'x@example.com',
        propertyName: 'P',
        prospectLabel: 'p',
        reason: 'r',
        conversationUrl: 'u',
      }),
    ).rejects.toThrow(/rate_limited/);
  });
});
