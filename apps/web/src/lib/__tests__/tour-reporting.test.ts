import { describe, expect, it } from 'vitest';
import { computeTourMetrics, getTourStatusLabel } from '../tour-reporting';

describe('tour reporting', () => {
  it('labels booked tours as scheduled for operators', () => {
    expect(getTourStatusLabel('booked')).toBe('Scheduled');
    expect(getTourStatusLabel('no_show')).toBe('No-show');
  });

  it('computes booking, completion, no-show, and upcoming rates', () => {
    const metrics = computeTourMetrics({
      now: new Date('2026-04-26T15:00:00.000Z'),
      totalConversations: 4,
      tours: [
        {
          status: 'booked',
          startAt: new Date('2026-04-27T15:00:00.000Z'),
          conversationId: 'conversation-1',
        },
        {
          status: 'completed',
          startAt: new Date('2026-04-25T15:00:00.000Z'),
          conversationId: 'conversation-2',
        },
        {
          status: 'converted',
          startAt: new Date('2026-04-24T15:00:00.000Z'),
          conversationId: 'conversation-2',
        },
        {
          status: 'no_show',
          startAt: new Date('2026-04-23T15:00:00.000Z'),
          conversationId: null,
        },
      ],
    });

    expect(metrics).toMatchObject({
      totalTours: 4,
      upcomingTours: 1,
      completedTours: 2,
      noShowTours: 1,
      bookingRate: 50,
      completionRate: 67,
      noShowRate: 33,
    });
  });
});
