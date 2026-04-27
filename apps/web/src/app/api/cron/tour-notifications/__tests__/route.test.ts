import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { processDueTourNotificationJobsMock } = vi.hoisted(() => ({
  processDueTourNotificationJobsMock: vi.fn(),
}));

vi.mock('@/lib/tour-notifications', () => ({
  processDueTourNotificationJobs: processDueTourNotificationJobsMock,
}));

import { GET } from '../route';

describe('tour notification cron route', () => {
  beforeEach(() => {
    processDueTourNotificationJobsMock.mockReset();
    processDueTourNotificationJobsMock.mockResolvedValue({
      processed: 3,
      sent: 2,
      suppressed: 0,
      failed: 1,
    });
    delete process.env.TOUR_NOTIFICATION_CRON_SECRET;
    delete process.env.CRON_SECRET;
  });

  it('processes due jobs in local/test without a secret', async () => {
    const response = await GET(new NextRequest('https://app.example.com/api/cron/tour-notifications?limit=3'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      processed: 3,
      sent: 2,
      suppressed: 0,
      failed: 1,
    });
    expect(processDueTourNotificationJobsMock).toHaveBeenCalledWith({ limit: 3 });
  });

  it('requires the configured secret when present', async () => {
    process.env.TOUR_NOTIFICATION_CRON_SECRET = 'cron-secret';
    const denied = await GET(new NextRequest('https://app.example.com/api/cron/tour-notifications'));
    expect(denied.status).toBe(401);

    const allowed = await GET(new NextRequest('https://app.example.com/api/cron/tour-notifications', {
      headers: { authorization: 'Bearer cron-secret' },
    }) as NextRequest);
    expect(allowed.status).toBe(200);
  });
});
