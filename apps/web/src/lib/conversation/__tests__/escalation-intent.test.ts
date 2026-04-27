import { describe, expect, it } from 'vitest';
import { classifyEscalationTrigger } from '../escalation-intent';

describe('classifyEscalationTrigger', () => {
  it.each([
    [
      'Can I talk to a real person instead of this bot?',
      'human_request',
      'high',
      'human representative',
    ],
    [
      'Emergency maintenance please, water is flooding my apartment right now.',
      'emergency',
      'urgent',
      'Emergency or urgent maintenance',
    ],
    [
      'My rent payment was charged twice and I need a refund.',
      'billing_payment',
      'high',
      'Billing or payment',
    ],
    [
      'I have a privacy concern and want you to delete my data.',
      'legal_privacy',
      'high',
      'Legal or privacy',
    ],
    [
      'The application portal will not work and I cannot submit my application.',
      'application_blocked',
      'high',
      'Application-blocking',
    ],
    [
      'This is unacceptable and I want to file a complaint.',
      'complaint',
      'high',
      'Complaint',
    ],
  ])('routes "%s" to %s', (message, category, priority, reason) => {
    const result = classifyEscalationTrigger(message);
    expect(result).toMatchObject({ category, priority });
    expect(result?.reason).toContain(reason);
  });

  it('returns null for ordinary leasing questions', () => {
    expect(classifyEscalationTrigger('Do you have any one bedrooms available next month?')).toBeNull();
  });

  it('directs emergency messages to official emergency channels', () => {
    const result = classifyEscalationTrigger('There is smoke in my unit and this is an emergency.');
    expect(result?.notice).toContain('call 911');
    expect(result?.notice).toContain('property emergency maintenance line');
  });
});
