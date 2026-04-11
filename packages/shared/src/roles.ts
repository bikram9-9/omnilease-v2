/**
 * Role model for omnilease operations.
 *
 * The DB enforces this set via a CHECK constraint added in
 * packages/db/drizzle/0002_roles_and_user_context.sql. Keep in sync.
 */

export const ROLES = ['worker', 'property_manager', 'supervisor_manager', 'admin'] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Can this role manage (CRUD) properties at all? */
export function canManageProperties(role: Role): boolean {
  return role === 'property_manager' || role === 'supervisor_manager' || role === 'admin';
}

/** Can this role view/manage *every* property in the org? */
export function canViewAllProperties(role: Role): boolean {
  return role === 'supervisor_manager' || role === 'admin';
}

/** Can this role manage users (invite, change role, deactivate)? */
export function canManageUsers(role: Role): boolean {
  return role === 'admin';
}

/** Workers see a task-focused home; managers see a property-focused home. */
export function defaultHomeRoute(role: Role): '/(app)/tasks' | '/(app)/properties' | '/(app)/admin' {
  switch (role) {
    case 'worker':
      return '/(app)/tasks';
    case 'property_manager':
    case 'supervisor_manager':
      return '/(app)/properties';
    case 'admin':
      return '/(app)/admin';
  }
}

/** Human-friendly label for UI. */
export function roleLabel(role: Role): string {
  switch (role) {
    case 'worker':
      return 'Worker';
    case 'property_manager':
      return 'Property Manager';
    case 'supervisor_manager':
      return 'Supervisor';
    case 'admin':
      return 'Admin';
  }
}
