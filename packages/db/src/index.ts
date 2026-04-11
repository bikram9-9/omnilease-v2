import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

// Supabase: prefer the **pooler** `DATABASE_URL` from the dashboard (Session or Transaction
// mode). The `db.<project>.supabase.co` direct host is often IPv6-only; without IPv6 you get
// getaddrinfo ENOTFOUND from Node. Pooler hostnames resolve on IPv4. `prepare: false` is
// required for PgBouncer / transaction pooler.
const client = postgres(process.env.DATABASE_URL, { prepare: false });
export const db = drizzle(client, { schema });

export * from './schema';
export type Database = typeof db;

// Re-export common Drizzle query helpers so apps/web never needs
// drizzle-orm as a direct dep (keeps the boundary clean).
export { eq, and, or, not, desc, asc, count, sql, inArray, gt, gte, lt, lte, isNull, isNotNull } from 'drizzle-orm';
