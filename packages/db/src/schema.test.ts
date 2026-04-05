import { describe, it, expect } from 'vitest';
import { organizations, users, properties, unitTypes, propertyKnowledge } from './schema';

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
        'id', 'orgId', 'name', 'address', 'city', 'state', 'zip',
        'timezone', 'officeHours', 'twilioPhone', 'webchatWidgetId',
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

  it('propertyKnowledge stores JSONB per category', () => {
    const cols = Object.keys(propertyKnowledge);
    expect(cols).toEqual(
      expect.arrayContaining(['id', 'propertyId', 'category', 'content']),
    );
  });
});

import { conversations, messages, escalations } from './schema';

describe('conversation schema', () => {
  it('conversations has channel + status', () => {
    const cols = Object.keys(conversations);
    expect(cols).toEqual(
      expect.arrayContaining([
        'id', 'propertyId', 'channel', 'externalId', 'status',
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
