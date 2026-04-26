import type {
  ConversationChannel,
  GuestCardActivityType,
  GuestCardStage,
  GuestCardStatus,
} from '@omnilease/db';

export type GuestCardExportInput = {
  guestCard: {
    id: string;
    orgId: string;
    status: GuestCardStatus;
    stage: GuestCardStage;
    source: string;
    fullName: string | null;
    email: string | null;
    phone: string | null;
    moveInDate: string | null;
    unitPreference: string | null;
    externalIds: Record<string, string>;
    notes: string | null;
    firstSeenAt: Date;
    lastSeenAt: Date;
    updatedAt: Date;
  };
  properties: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
  conversations: Array<{
    id: string;
    propertyId: string;
    channel: ConversationChannel;
    status: string;
    externalId: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  activities: Array<{
    id: string;
    eventType: GuestCardActivityType;
    title: string;
    occurredAt: Date;
  }>;
};

export type GuestCardExportPayload = ReturnType<typeof buildGuestCardExportPayload>;

export function buildGuestCardExportPayload(input: GuestCardExportInput) {
  return {
    version: 'guest-card.v1',
    exportedAt: new Date().toISOString(),
    guestCard: {
      id: input.guestCard.id,
      orgId: input.guestCard.orgId,
      status: input.guestCard.status,
      stage: input.guestCard.stage,
      source: input.guestCard.source,
      contact: {
        name: input.guestCard.fullName,
        email: input.guestCard.email,
        phone: input.guestCard.phone,
      },
      preferences: {
        moveInDate: input.guestCard.moveInDate,
        unitPreference: input.guestCard.unitPreference,
      },
      externalIds: input.guestCard.externalIds,
      notes: input.guestCard.notes,
      firstSeenAt: input.guestCard.firstSeenAt.toISOString(),
      lastSeenAt: input.guestCard.lastSeenAt.toISOString(),
      updatedAt: input.guestCard.updatedAt.toISOString(),
    },
    properties: input.properties.map((property) => ({
      id: property.id,
      name: property.name,
      slug: property.slug,
    })),
    conversations: input.conversations.map((conversation) => ({
      id: conversation.id,
      propertyId: conversation.propertyId,
      channel: conversation.channel,
      status: conversation.status,
      externalId: conversation.externalId,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    })),
    activity: input.activities.map((activity) => ({
      id: activity.id,
      type: activity.eventType,
      title: activity.title,
      occurredAt: activity.occurredAt.toISOString(),
    })),
  };
}

