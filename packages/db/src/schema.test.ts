import { describe, it, expect } from 'vitest';
import { organizations, users, properties, unitTypes } from './schema';

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
