import { describe, expect, it, vi } from 'vitest';
import { buildGuestCardExportPayload } from '../export';

describe('guest card export contract', () => {
  it('emits a stable v1 payload for PMS/CRM guest-card sync', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T18:00:00.000Z'));

    const payload = buildGuestCardExportPayload({
      guestCard: {
        id: 'guest_1',
        orgId: 'org_1',
        status: 'active',
        stage: 'nurturing',
        source: 'website_widget',
        fullName: 'Avery Stone',
        email: 'avery@example.com',
        phone: '+15125551000',
        moveInDate: '2026-06-01',
        unitPreference: '2 bed',
        externalIds: { website: 'sess_123' },
        notes: null,
        firstSeenAt: new Date('2026-04-24T10:00:00.000Z'),
        lastSeenAt: new Date('2026-04-25T17:00:00.000Z'),
        updatedAt: new Date('2026-04-25T17:05:00.000Z'),
      },
      properties: [{ id: 'property_1', name: 'Sunset Ridge', slug: 'sunset-ridge' }],
      conversations: [{
        id: 'conversation_1',
        propertyId: 'property_1',
        channel: 'website',
        status: 'active',
        externalId: 'sess_123',
        createdAt: new Date('2026-04-24T10:00:00.000Z'),
        updatedAt: new Date('2026-04-25T17:00:00.000Z'),
      }],
      activities: [{
        id: 'activity_1',
        eventType: 'conversation',
        title: 'Sunset Ridge website conversation',
        occurredAt: new Date('2026-04-24T10:00:00.000Z'),
      }],
    });

    expect(payload).toMatchObject({
      version: 'guest-card.v1',
      exportedAt: '2026-04-25T18:00:00.000Z',
      guestCard: {
        id: 'guest_1',
        contact: {
          name: 'Avery Stone',
          email: 'avery@example.com',
          phone: '+15125551000',
        },
        preferences: {
          moveInDate: '2026-06-01',
          unitPreference: '2 bed',
        },
        externalIds: { website: 'sess_123' },
      },
      properties: [{ id: 'property_1', name: 'Sunset Ridge', slug: 'sunset-ridge' }],
      conversations: [{ id: 'conversation_1', channel: 'website', status: 'active' }],
      activity: [{ id: 'activity_1', type: 'conversation' }],
    });

    vi.useRealTimers();
  });
});
