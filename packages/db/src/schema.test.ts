import { describe, it, expect } from 'vitest';
import { organizations, users } from './schema';

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
      expect.arrayContaining(['id', 'clerkUserId', 'orgId', 'email', 'role']),
    );
  });
});
