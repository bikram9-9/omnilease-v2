# Guest Card Export Contract

`OMN-147` defines the first PMS/CRM guest-card payload as `guest-card.v1`.

The export endpoint is:

```http
GET /guest-cards/:id/export
```

The route is authenticated through the dashboard org context and only exports cards in the current organization.

## Payload

```json
{
  "version": "guest-card.v1",
  "exportedAt": "2026-04-25T18:00:00.000Z",
  "guestCard": {
    "id": "uuid",
    "orgId": "uuid",
    "status": "active",
    "stage": "nurturing",
    "source": "website_widget",
    "contact": {
      "name": "Avery Stone",
      "email": "avery@example.com",
      "phone": "+15125551000"
    },
    "preferences": {
      "moveInDate": "2026-06-01",
      "unitPreference": "2 bed"
    },
    "externalIds": {
      "website": "sess_123"
    },
    "notes": null,
    "firstSeenAt": "2026-04-24T10:00:00.000Z",
    "lastSeenAt": "2026-04-25T17:00:00.000Z",
    "updatedAt": "2026-04-25T17:05:00.000Z"
  },
  "properties": [
    {
      "id": "uuid",
      "name": "Sunset Ridge",
      "slug": "sunset-ridge"
    }
  ],
  "conversations": [
    {
      "id": "uuid",
      "propertyId": "uuid",
      "channel": "website",
      "status": "active",
      "externalId": "sess_123",
      "createdAt": "2026-04-24T10:00:00.000Z",
      "updatedAt": "2026-04-25T17:00:00.000Z"
    }
  ],
  "activity": [
    {
      "id": "uuid",
      "type": "conversation",
      "title": "Sunset Ridge website conversation",
      "occurredAt": "2026-04-24T10:00:00.000Z"
    }
  ]
}
```

## Notes

- `guestCard.externalIds` is a channel/provider map and can hold future PMS/CRM IDs.
- `properties` may include multiple records when a prospect has cross-property activity in the same organization.
- `activity.type` is reserved for `conversation`, `tour`, `quote`, `application`, `task`, `note`, `merge`, and `integration`.
- Merge audit snapshots are stored in `guest_card_merge_audits` so operator merges can be reverted before external write-back.
