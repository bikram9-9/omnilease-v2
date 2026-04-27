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
        and to_regclass('public.tour_bookings') is not null
        and to_regclass('public.tour_notification_jobs') is not null
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

    const tourSettingsReadiness = await db.execute(sql<{ ready: boolean }>`
      select to_regclass('public.property_tour_settings') is not null as ready
    `);

    if (!tourSettingsReadiness[0]?.ready) {
      const migration = await readFile(
        path.resolve(__dirname, '../../packages/db/drizzle/0010_phase_b_tour_settings.sql'),
        'utf8',
      );
      await db.execute(sql.raw(migration));
    }

    const calendarReadiness = await db.execute(sql<{ ready: boolean }>`
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'property_tour_settings'
          and column_name = 'calendar_provider'
      ) as ready
    `);

    if (!calendarReadiness[0]?.ready) {
      const migration = await readFile(
        path.resolve(__dirname, '../../packages/db/drizzle/0011_phase_b_calendar_availability.sql'),
        'utf8',
      );
      await db.execute(sql.raw(migration));
    }

    const bookingReadiness = await db.execute(sql<{ ready: boolean }>`
      select to_regclass('public.tour_bookings') is not null as ready
    `);

    if (!bookingReadiness[0]?.ready) {
      const migration = await readFile(
        path.resolve(__dirname, '../../packages/db/drizzle/0012_phase_b_tour_bookings.sql'),
        'utf8',
      );
      await db.execute(sql.raw(migration));
    }

    const notificationReadiness = await db.execute(sql<{ ready: boolean }>`
      select to_regclass('public.tour_notification_jobs') is not null as ready
    `);

    if (!notificationReadiness[0]?.ready) {
      const migration = await readFile(
        path.resolve(__dirname, '../../packages/db/drizzle/0013_phase_b_tour_notifications.sql'),
        'utf8',
      );
      await db.execute(sql.raw(migration));
    }

    const disclosureReadiness = await db.execute(sql<{ ready: boolean }>`
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'properties'
          and column_name = 'ai_disclosure'
      ) as ready
    `);

    if (!disclosureReadiness[0]?.ready) {
      const migration = await readFile(
        path.resolve(__dirname, '../../packages/db/drizzle/0014_phase_b_widget_disclosure.sql'),
        'utf8',
      );
      await db.execute(sql.raw(migration));
    }

    const tourOwnerReadiness = await db.execute(sql<{ ready: boolean }>`
      select to_regclass('public.tour_owners') is not null
        and exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'tour_bookings'
            and column_name = 'tour_owner_id'
        ) as ready
    `);

    if (!tourOwnerReadiness[0]?.ready) {
      const migration = await readFile(
        path.resolve(__dirname, '../../packages/db/drizzle/0015_phase_b_tour_owners.sql'),
        'utf8',
      );
      await db.execute(sql.raw(migration));
    }

    const quoteFeeReadiness = await db.execute(sql<{ ready: boolean }>`
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'properties'
          and column_name = 'application_url'
      ) and exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'unit_types'
          and column_name = 'recurring_fees'
      ) as ready
    `);

    if (!quoteFeeReadiness[0]?.ready) {
      const migration = await readFile(
        path.resolve(__dirname, '../../packages/db/drizzle/0017_phase_b_quote_fee_mvp.sql'),
        'utf8',
      );
      await db.execute(sql.raw(migration));
    }

    const readinessGateReadiness = await db.execute(sql<{ ready: boolean }>`
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'properties'
          and column_name = 'launch_mode'
      ) as ready
    `);

    if (!readinessGateReadiness[0]?.ready) {
      const migration = await readFile(
        path.resolve(__dirname, '../../packages/db/drizzle/0018_phase_b_readiness_gate.sql'),
        'utf8',
      );
      await db.execute(sql.raw(migration));
    }
  } finally {
    await db.execute(sql`select pg_advisory_unlock(990009)`);
  }
}
