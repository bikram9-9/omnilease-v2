import { type NextRequest } from 'next/server';
import { processDueTourNotificationJobs } from '@/lib/tour-notifications';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<Response> {
  return runTourNotificationCron(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return runTourNotificationCron(req);
}

async function runTourNotificationCron(req: NextRequest): Promise<Response> {
  if (!isAuthorized(req)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const limit = Number(req.nextUrl.searchParams.get('limit') ?? '50');
  const result = await processDueTourNotificationJobs({
    limit: Number.isFinite(limit) ? limit : 50,
  });

  return Response.json({ ok: true, ...result });
}

function isAuthorized(req: NextRequest) {
  const secret = process.env.TOUR_NOTIFICATION_CRON_SECRET ?? process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV !== 'production') return true;
  if (!secret) return false;

  const authorization = req.headers.get('authorization');
  if (authorization === `Bearer ${secret}`) return true;

  return req.nextUrl.searchParams.get('secret') === secret;
}
