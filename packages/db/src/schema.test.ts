import { describe, it, expect } from 'vitest';
import {
  organizations,
  users,
  properties,
  unitTypes,
  propertyKnowledgeSections,
  propertyAssistantSettings,
  guestCards,
  guestCardActivities,
  guestCardDuplicateCandidates,
  guestCardMergeAudits,
  guestCardPropertyLinks,
} from './schema';

describe('tenancy schema', () => {
  it('organizations has required columns', () => {
    const cols = Object.keys(organizations);
    expect(cols).toEqual(
      expect.arrayContaining(['id', 'name', 'slug', 'plan', 'createdAt']),
    );
  });

  it('users references organizations', () => {
    const cols = Object.keys(users);
    expect(cols).toEqual(
      expect.arrayContaining(['id', 'authUserId', 'orgId', 'email', 'role']),
    );
  });
});

describe('property schema', () => {
  it('properties has required columns', () => {
    const cols = Object.keys(properties);
    expect(cols).toEqual(
      expect.arrayContaining([
        'id', 'orgId', 'slug', 'name', 'address', 'city', 'state', 'zip',
        'timezone', 'officeHours', 'websiteWidgetId', 'messengerPageId',
      ]),
    );
  });

  it('unitTypes references properties', () => {
    const cols = Object.keys(unitTypes);
    expect(cols).toEqual(
      expect.arrayContaining([
        'id', 'propertyId', 'name', 'bedrooms', 'bathrooms',
        'priceMin', 'priceMax', 'availableCount', 'isActive',
      ]),
    );
  });

  it('units remain relational and queryable per property', () => {
    const cols = Object.keys(unitTypes);
    expect(cols).toEqual(
      expect.arrayContaining([
        'id', 'propertyId', 'name', 'bedrooms', 'bathrooms',
        'priceMin', 'priceMax', 'availableCount', 'isActive',
      ]),
    );
  });
});

import { conversations, messages, escalations, conversationModelEvents } from './schema';

describe('conversation schema', () => {
  it('conversations has channel + status', () => {
    const cols = Object.keys(conversations);
    expect(cols).toEqual(
      expect.arrayContaining([
        'id', 'propertyId', 'guestCardId', 'channel', 'externalId', 'status',
        'automationState',
        'prospectPhone', 'prospectEmail', 'prospectName',
      ]),
    );
  });

  it('messages stores role + content', () => {
    const cols = Object.keys(messages);
    expect(cols).toEqual(
      expect.arrayContaining([
        'id', 'conversationId', 'role', 'content', 'channel',
        'tokensUsed', 'llmCost',
      ]),
    );
  });

  it('escalations has priority + resolvedAt', () => {
    const cols = Object.keys(escalations);
    expect(cols).toEqual(
      expect.arrayContaining([
        'id', 'conversationId', 'reason', 'priority', 'resolvedAt',
      ]),
    );
  });
});

describe('guest card schema', () => {
  it('guestCards stores centralized CRM identity and lifecycle fields', () => {
    const cols = Object.keys(guestCards);
    expect(cols).toEqual(
      expect.arrayContaining([
        'id', 'orgId', 'primaryPropertyId', 'ownerUserId', 'status', 'stage',
        'fullName', 'email', 'phone', 'normalizedEmail', 'normalizedPhone',
        'moveInDate', 'unitPreference', 'externalIds', 'mergedIntoGuestCardId',
        'emailConsentStatus', 'smsConsentStatus', 'marketingConsentStatus',
      ]),
    );
  });

  it('guest card support tables cover property links, duplicates, merges, and activity', () => {
    expect(Object.keys(guestCardPropertyLinks)).toEqual(
      expect.arrayContaining(['id', 'guestCardId', 'propertyId', 'source']),
    );
    expect(Object.keys(guestCardDuplicateCandidates)).toEqual(
      expect.arrayContaining([
        'id', 'orgId', 'primaryGuestCardId', 'duplicateGuestCardId',
        'status', 'confidence', 'matchReasons',
      ]),
    );
    expect(Object.keys(guestCardMergeAudits)).toEqual(
      expect.arrayContaining([
        'id', 'orgId', 'sourceGuestCardId', 'targetGuestCardId',
        'sourceSnapshot', 'targetSnapshot', 'reversible', 'revertedAt',
      ]),
    );
    expect(Object.keys(guestCardActivities)).toEqual(
      expect.arrayContaining([
        'id', 'guestCardId', 'propertyId', 'conversationId', 'eventType',
        'title', 'metadata',
      ]),
    );
  });
});

describe('phase A operations schema', () => {
  it('property knowledge sections store editable published/draft content', () => {
    expect(Object.keys(propertyKnowledgeSections)).toEqual(
      expect.arrayContaining([
        'id', 'propertyId', 'section', 'title', 'body', 'status', 'source',
        'validationWarnings', 'publishedAt', 'updatedBy',
      ]),
    );
  });

  it('assistant settings support prompt behavior controls', () => {
    expect(Object.keys(propertyAssistantSettings)).toEqual(
      expect.arrayContaining([
        'id', 'propertyId', 'version', 'primaryGoal', 'tone', 'ctaPreference',
        'screeningQuestions', 'sellingPoints', 'escalationTriggers',
      ]),
    );
  });

  it('conversation model events capture LLM observability metadata', () => {
    expect(Object.keys(conversationModelEvents)).toEqual(
      expect.arrayContaining([
        'id', 'conversationId', 'propertyId', 'messageId', 'status', 'model',
        'promptVersion', 'assistantSettingsVersion', 'latencyMs', 'toolCalls',
        'safetyOutcome', 'confidenceScore', 'intent', 'escalationReason',
      ]),
    );
  });
});
