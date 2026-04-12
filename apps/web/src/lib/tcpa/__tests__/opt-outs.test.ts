import { describe, it, expect, beforeEach } from 'vitest';
import { db, eq } from '@omnilease/db';
import { organizations, properties, smsOptOuts } from '@omnilease/db';
import { isOptedOut, markOptedOut, isStopKeyword } from '../opt-outs';

const TEST_PREFIX = 'tcpa-test-';

async function seedProperty() {
  const [org] = await db
    .insert(organizations)
    .values({
      name: `${TEST_PREFIX}org`,
      slug: `${TEST_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      plan: 'starter',
    })
    .returning();
  const [prop] = await db
    .insert(properties)
    .values({
      orgId: org.id,
      name: 'Test Property',
      timezone: 'America/Chicago',
    })
    .returning();
  return { orgId: org.id, propertyId: prop.id };
}

async function cleanup(orgId: string) {
  await db.delete(organizations).where(eq(organizations.id, orgId));
}

describe('isStopKeyword (pure)', () => {
  it.each([
    ['STOP', true],
    ['stop', true],
    ['Stop', true],
    ['  STOP  ', true],
    ['UNSUBSCRIBE', true],
    ['CANCEL', true],
    ['END', true],
    ['QUIT', true],
    ['hello', false],
    ['stop it please', false], // multi-word — not a bare STOP command
    ['', false],
  ])('returns %s for "%s"', (input, expected) => {
    expect(isStopKeyword(input as string)).toBe(expected);
  });
});

describe('markOptedOut + isOptedOut (integration)', () => {
  let orgId: string;
  let propertyId: string;

  beforeEach(async () => {
    const seeded = await seedProperty();
    orgId = seeded.orgId;
    propertyId = seeded.propertyId;
  });

  it('returns false before any opt-out is recorded', async () => {
    try {
      expect(await isOptedOut(propertyId, '+15551111111')).toBe(false);
    } finally {
      await cleanup(orgId);
    }
  });

  it('returns true after markOptedOut', async () => {
    try {
      await markOptedOut(propertyId, '+15552222222', 'STOP');
      expect(await isOptedOut(propertyId, '+15552222222')).toBe(true);
    } finally {
      await cleanup(orgId);
    }
  });

  it('is per-property — opting out at property A does not affect property B', async () => {
    const other = await seedProperty();
    try {
      await markOptedOut(propertyId, '+15553333333', 'STOP');
      expect(await isOptedOut(propertyId, '+15553333333')).toBe(true);
      expect(await isOptedOut(other.propertyId, '+15553333333')).toBe(false);
    } finally {
      await cleanup(orgId);
      await cleanup(other.orgId);
    }
  });

  it('markOptedOut is idempotent — calling twice does not throw', async () => {
    try {
      await markOptedOut(propertyId, '+15554444444', 'STOP');
      await markOptedOut(propertyId, '+15554444444', 'STOP');
      const rows = await db
        .select()
        .from(smsOptOuts)
        .where(eq(smsOptOuts.propertyId, propertyId));
      expect(rows.length).toBe(1); // unique index prevents dup
    } finally {
      await cleanup(orgId);
    }
  });
});
