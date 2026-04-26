import { NextResponse } from 'next/server';
import { requireOrg } from '@/lib/auth';
import { buildGuestCardExportPayload } from '@/lib/guest-cards/export';
import { getGuestCardExportInput } from '@/lib/guest-cards/service';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { orgId } = await requireOrg();
  const exportInput = await getGuestCardExportInput(orgId, id);

  if (!exportInput) {
    return NextResponse.json({ error: 'guest card not found' }, { status: 404 });
  }

  return NextResponse.json(buildGuestCardExportPayload(exportInput));
}
