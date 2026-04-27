import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, eq } from '@omnilease/db';
import {
  organizations,
  properties,
  tourBookings,
  tourOwners,
} from '@omnilease/db';
import { routeTourOwnerForInterval } from '../tour-owners';
import type { CalendarAvailabilityProvider } from '../tour-availability';

const TEST_PREFIX = 'tour-owner-unit-';

beforeEach(() => {
  vi.restoreAllMocks();
});

async function seedOwnerProperty() {
  const [org] = await db
    .insert(organizations)
    .values({
      name: `${TEST_PREFIX}org`,
      slug: `${TEST_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      plan: 'starter',
    })
    .returning();

  const [property] = await db
    .insert(properties)
    .values({
      orgId: org.id,
      slug: `${TEST_PREFIX}property-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Sunset Ridge',
      timezone: 'America/Chicago',
    })
    .returning();

  return { orgId: org.id, propertyId: property.id };
}

async function cleanup(orgId: string) {
  await db.delete(organizations).where(eq(organizations.id, orgId));
}

describe('tour owner routing', () => {
  it('assigns the first active owner that supports the tour type', async () => {
    const seed = await seedOwnerProperty();
    try {
      const [owner] = await db.insert(tourOwners).values({
        propertyId: seed.propertyId,
        displayName: 'Avery Agent',
        email: 'avery.agent@example.com',
        tourTypes: ['in_person'],
        assignmentPriority: 10,
      }).returning();

      const assignment = await routeTourOwnerForInterval({
        propertyId: seed.propertyId,
        tourType: 'in_person',
        timezone: 'America/Chicago',
        interval: {
          start: new Date('2026-04-27T14:00:00.000Z'),
          end: new Date('2026-04-27T14:30:00.000Z'),
        },
        provider: null,
      });

      expect(assignment).toMatchObject({
        status: 'assigned',
        reason: 'Assigned by deterministic owner priority.',
      });
      expect(assignment.owner?.id).toBe(owner.id);
    } finally {
      await cleanup(seed.orgId);
    }
  });

  it('skips owners with overlapping booked tours and falls through to the next owner', async () => {
    const seed = await seedOwnerProperty();
    try {
      const [busyOwner, backupOwner] = await db.insert(tourOwners).values([
        {
          propertyId: seed.propertyId,
          displayName: 'Busy Agent',
          tourTypes: ['in_person'],
          assignmentPriority: 10,
        },
        {
          propertyId: seed.propertyId,
          displayName: 'Backup Agent',
          tourTypes: ['in_person'],
          assignmentPriority: 20,
        },
      ]).returning();
      await db.insert(tourBookings).values({
        propertyId: seed.propertyId,
        tourOwnerId: busyOwner.id,
        tourType: 'in_person',
        status: 'booked',
        startAt: new Date('2026-04-27T14:00:00.000Z'),
        endAt: new Date('2026-04-27T14:30:00.000Z'),
        timezone: 'America/Chicago',
        source: 'operator',
        ownerAssignmentStatus: 'assigned',
        metadata: {},
      });

      const assignment = await routeTourOwnerForInterval({
        propertyId: seed.propertyId,
        tourType: 'in_person',
        timezone: 'America/Chicago',
        interval: {
          start: new Date('2026-04-27T14:15:00.000Z'),
          end: new Date('2026-04-27T14:45:00.000Z'),
        },
        provider: null,
      });

      expect(assignment.owner?.id).toBe(backupOwner.id);
    } finally {
      await cleanup(seed.orgId);
    }
  });

  it('uses owner calendar busy data and returns fallback status on provider failure', async () => {
    const seed = await seedOwnerProperty();
    try {
      const [calendarOwner] = await db.insert(tourOwners).values({
        propertyId: seed.propertyId,
        displayName: 'Calendar Agent',
        tourTypes: ['in_person'],
        calendarProvider: 'google_calendar',
        calendarId: 'calendar-agent@example.com',
        assignmentPriority: 10,
      }).returning();

      const busyProvider: CalendarAvailabilityProvider = {
        async getBusyIntervals() {
          return [{
            start: new Date('2026-04-27T14:00:00.000Z'),
            end: new Date('2026-04-27T14:30:00.000Z'),
          }];
        },
      };
      const unavailable = await routeTourOwnerForInterval({
        propertyId: seed.propertyId,
        tourType: 'in_person',
        timezone: 'America/Chicago',
        interval: {
          start: new Date('2026-04-27T14:00:00.000Z'),
          end: new Date('2026-04-27T14:30:00.000Z'),
        },
        provider: busyProvider,
      });
      expect(unavailable.status).toBe('unavailable_agents');

      const failingProvider: CalendarAvailabilityProvider = {
        async getBusyIntervals() {
          throw new Error('calendar offline');
        },
      };
      const fallback = await routeTourOwnerForInterval({
        propertyId: seed.propertyId,
        tourType: 'in_person',
        timezone: 'America/Chicago',
        interval: {
          start: new Date('2026-04-27T15:00:00.000Z'),
          end: new Date('2026-04-27T15:30:00.000Z'),
        },
        provider: failingProvider,
      });

      expect(fallback).toMatchObject({
        owner: expect.objectContaining({ id: calendarOwner.id }),
        status: 'fallback_assigned',
        calendarError: 'calendar offline',
      });
    } finally {
      await cleanup(seed.orgId);
    }
  });
});
