import { db, and, eq } from '@omnilease/db';
import { smsOptOuts, type OptOutKeyword } from '@omnilease/db';

const STOP_KEYWORDS: readonly string[] = ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];

/**
 * True if the inbound body is a standalone STOP-family keyword.
 * Whitespace is trimmed; case is ignored. Multi-word messages that
 * *contain* "stop" are not treated as opt-outs — only bare commands.
 */
export function isStopKeyword(body: string): boolean {
  const trimmed = body.trim().toUpperCase();
  return STOP_KEYWORDS.includes(trimmed);
}

/**
 * Check whether this phone has opted out of messages from this property.
 * Returns false if the property_id / phone tuple has no row.
 */
export async function isOptedOut(propertyId: string, phone: string): Promise<boolean> {
  const [row] = await db
    .select({ id: smsOptOuts.id })
    .from(smsOptOuts)
    .where(and(eq(smsOptOuts.propertyId, propertyId), eq(smsOptOuts.phone, phone)))
    .limit(1);
  return Boolean(row);
}

/**
 * Record an opt-out. Idempotent via the (property_id, phone) unique index —
 * a second call for the same pair is a silent no-op.
 */
export async function markOptedOut(
  propertyId: string,
  phone: string,
  keyword: OptOutKeyword,
): Promise<void> {
  await db
    .insert(smsOptOuts)
    .values({ propertyId, phone, keyword })
    .onConflictDoNothing({ target: [smsOptOuts.propertyId, smsOptOuts.phone] });
}
