import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

// Supabase: use the pooler connection string for runtime (port 6543)
// with `?pgbouncer=true`. Drizzle-kit migrations should use the direct
// connection (port 5432) — see drizzle.config.ts comments.
const client = postgres(process.env.DATABASE_URL, { prepare: false });
export const db = drizzle(client, { schema });

export * from './schema';
export type Database = typeof db;

// Re-export common Drizzle query helpers so apps/web never needs
// drizzle-orm as a direct dep (keeps the boundary clean).
export { eq, and, or, not, desc, asc, count, sql, inArray, gt, gte, lt, lte, isNull, isNotNull } from 'drizzle-orm';
