/**
 * Role model for the omnilease AI answering service.
 *
 * The DB enforces this set via a CHECK constraint in
 * packages/db/drizzle/0003_phase1_role_rename.sql. Keep in sync.
 */

export const ROLES = ['admin', 'manager', 'agent'] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Only admins can invite users or change roles. */
export function canManageOrg(role: Role): boolean {
  return role === 'admin';
}

/** Admins and managers can edit property data (knowledge base, unit types, etc.). */
export function canEditProperty(role: Role): boolean {
  return role === 'admin' || role === 'manager';
}

/** All three roles can take over a conversation and reply as a human. */
export function canReplyToConversation(role: Role): boolean {
  return role === 'admin' || role === 'manager' || role === 'agent';
}

/** Human-friendly label for UI. */
export function roleLabel(role: Role): string {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'manager':
      return 'Property Manager';
    case 'agent':
      return 'Leasing Agent';
  }
}
