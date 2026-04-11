import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export type Role = 'admin' | 'manager' | 'agent';

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: text('plan').notNull().default('starter'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    // FK to Supabase's built-in auth.users(id). Managed manually because
    // Drizzle can't introspect the `auth` schema — we enforce this with a
    // raw SQL `ADD CONSTRAINT` in the migration.
    authUserId: uuid('auth_user_id').notNull().unique(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name'),
    // Operations role enum: admin | manager | agent.
    // Enforced by a CHECK constraint added in 0002_roles_and_user_context.sql.
    role: text('role').$type<Role>().notNull().default('agent'),
    phone: text('phone'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('users_org_idx').on(t.orgId),
  }),
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
