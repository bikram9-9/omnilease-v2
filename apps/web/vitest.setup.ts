import { config } from 'dotenv';
import { readFile } from 'node:fs/promises';
import path from 'path';

// Load test-local env before any module (including @omnilease/db) is evaluated.
// This must run in a setupFile (not inline in the test) because ES module
// imports are hoisted — inline loadEnv() calls run AFTER the imported module
// code, which means DATABASE_URL would still be undefined when db/src/index.ts
// executes its guard check.
config({ path: path.resolve(__dirname, '.env.test.local') });

if (process.env.DATABASE_URL) {
  const { db, sql } = await import('@omnilease/db');
  await db.execute(sql`select pg_advisory_lock(990009)`);
  try {
    const readiness = await db.execute(sql<{ ready: boolean }>`
      select
        to_regclass('public.property_knowledge_sections') is not null
        and to_regclass('public.property_assistant_settings') is not null
        and to_regclass('public.conversation_model_events') is not null
        and to_regclass('public.property_tour_settings') is not null
        and exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'guest_cards'
            and column_name = 'email_consent_status'
        ) as ready
    `);

    if (!readiness[0]?.ready) {
      const migration = await readFile(
        path.resolve(__dirname, '../../packages/db/drizzle/0009_phase_a_knowledge_settings_observability.sql'),
        'utf8',
      );
      await db.execute(sql.raw(migration));
    }

    const tourReadiness = await db.execute(sql<{ ready: boolean }>`
      select to_regclass('public.property_tour_settings') is not null as ready
    `);

    if (!tourReadiness[0]?.ready) {
      const migration = await readFile(
        path.resolve(__dirname, '../../packages/db/drizzle/0010_phase_b_tour_settings.sql'),
        'utf8',
      );
      await db.execute(sql.raw(migration));
    }
  } finally {
    await db.execute(sql`select pg_advisory_unlock(990009)`);
  }
}
