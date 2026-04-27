import { config } from 'dotenv';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import postgres from 'postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');

config({ path: path.join(webRoot, '.env.local') });
if (!process.env.DATABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
  config({ path: path.join(webRoot, '.env.test.local'), override: true });
}

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const email = process.env.E2E_EMAIL || 'e2e-smoke@omnilease.local';
const password = process.env.E2E_PASSWORD || 'OmniLeaseE2E!2026';
const orgName = process.env.E2E_ORG_NAME || 'OmniLease E2E Smoke';
const orgSlug = process.env.E2E_ORG_SLUG || 'omnilease-e2e-smoke';
const widgetId = process.env.E2E_WIDGET_ID || 'wdg_e2e_smoke';
const propertySlug = process.env.E2E_PROPERTY_SLUG || 'e2e-smoke-property';
const tourProspectEmail = process.env.E2E_TOUR_PROSPECT_EMAIL || 'e2e-tour-prospect@omnilease.local';
const seedOutput = process.env.E2E_SEED_OUTPUT || path.resolve(webRoot, '../../.playwright-cli/e2e-smoke-seed.json');

if (!databaseUrl || !supabaseUrl || !publishableKey) {
  console.log('E2E seed skipped: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, and publishable key are required.');
  process.exit(0);
}

if (!isLocalDatabaseUrl(databaseUrl) && process.env.E2E_ALLOW_REMOTE_SEED !== '1') {
  console.log('E2E seed skipped: refusing to seed a remote database without E2E_ALLOW_REMOTE_SEED=1.');
  process.exit(0);
}

function isLocalDatabaseUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

async function signUpIfNeeded() {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${publishableKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (response.ok) return;

  const body = await response.text();
  if (/already|registered|exists/i.test(body)) return;
  throw new Error(`Auth signup failed: ${body}`);
}

async function findAuthUser(sql) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const rows = await sql`
      select id
      from auth.users
      where lower(email) = lower(${email})
      limit 1
    `;
    if (rows[0]) return rows[0];
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Auth user was not created for ${email}`);
}

async function main() {
  await signUpIfNeeded();

  const sql = postgres(databaseUrl, { prepare: false, max: 1 });
  try {
    await ensureE2eMigrations(sql);
    const authUser = await findAuthUser(sql);

    await sql`
      update auth.users
      set
        encrypted_password = crypt(${password}, gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
      where id = ${authUser.id}
    `;

    const [org] = await sql`
      insert into public.organizations (name, slug, plan)
      values (${orgName}, ${orgSlug}, 'starter')
      on conflict (slug)
      do update set name = excluded.name
      returning id
    `;

    await sql`
      insert into public.users (auth_user_id, org_id, email, name, role)
      values (${authUser.id}, ${org.id}, ${email}, 'E2E Smoke User', 'admin')
      on conflict (auth_user_id)
      do update set
        org_id = excluded.org_id,
        email = excluded.email,
        name = excluded.name,
        role = excluded.role
    `;

    const [property] = await sql`
      insert into public.properties (
        org_id,
        slug,
        name,
        address,
        city,
        state,
        zip,
        timezone,
        website_widget_id,
        brand_color,
        escalation_email,
        welcome_message,
        ai_disclosure,
        privacy_notice_url,
        terms_url,
        privacy_disclosure_text,
        contact_fallback_label,
        contact_fallback_url,
        contact_fallback_text,
        updated_at
      )
      values (
        ${org.id},
        ${propertySlug},
        'E2E Smoke Apartments',
        '100 Smoke Test Way',
        'Austin',
        'TX',
        '78701',
        'America/Chicago',
        ${widgetId},
        '#0f766e',
        ${email},
        'Hi, I can help with availability, tours, and leasing questions.',
        'I am the AI leasing assistant for E2E Smoke Apartments.',
        'https://example.com/privacy',
        'https://example.com/terms',
        'Your chat may be processed by OmniLease and the property team to answer leasing questions.',
        'Contact leasing office',
        'mailto:e2e-smoke@omnilease.local',
        'Contact the leasing office at e2e-smoke@omnilease.local for human help.',
        now()
      )
      on conflict (slug)
      do update set
        name = excluded.name,
        website_widget_id = excluded.website_widget_id,
        escalation_email = excluded.escalation_email,
        welcome_message = excluded.welcome_message,
        ai_disclosure = excluded.ai_disclosure,
        privacy_notice_url = excluded.privacy_notice_url,
        terms_url = excluded.terms_url,
        privacy_disclosure_text = excluded.privacy_disclosure_text,
        contact_fallback_label = excluded.contact_fallback_label,
        contact_fallback_url = excluded.contact_fallback_url,
        contact_fallback_text = excluded.contact_fallback_text,
        updated_at = now()
      returning id
    `;

    const [unit] = await sql`
      select id
      from public.unit_types
      where property_id = ${property.id}
        and name = 'E2E 1BR'
      limit 1
    `;

    if (unit) {
      await sql`
        update public.unit_types
        set
          bedrooms = 1,
          bathrooms = 1.0,
          sqft_min = 650,
          sqft_max = 720,
          price_min = 1500,
          price_max = 1700,
          available_count = 2,
          deposit = 500,
          description = 'Smoke-test one bedroom floor plan.',
          is_active = true
        where id = ${unit.id}
      `;
    } else {
      await sql`
        insert into public.unit_types (
          property_id,
          name,
          bedrooms,
          bathrooms,
          sqft_min,
          sqft_max,
          price_min,
          price_max,
          available_count,
          deposit,
          description,
          is_active
        )
        values (
          ${property.id},
          'E2E 1BR',
          1,
          1.0,
          650,
          720,
          1500,
          1700,
          2,
          500,
          'Smoke-test one bedroom floor plan.',
          true
        )
      `;
    }

    const sections = [
      ['overview', 'Overview', 'E2E Smoke Apartments is a smoke-test community used for dashboard and widget verification.'],
      ['amenities', 'Amenities', 'Amenities include a fitness room, package lockers, and on-site parking.'],
      ['policies', 'Policies', 'Dogs are allowed up to 75 lbs. Application, deposit, parking, and pet-fee details should be confirmed by the leasing team.'],
      ['faqs', 'FAQs', 'Q: Are utilities included?\nA: Water and trash are included. Electric is separate.'],
      ['touring', 'Touring', 'Prospects can ask to schedule a tour during office hours. Escalate exact scheduling requests to the leasing team.'],
    ];

    for (const [section, title, body] of sections) {
      await sql`
        insert into public.property_knowledge_sections (
          property_id,
          section,
          title,
          body,
          status,
          source,
          validation_warnings,
          published_at,
          updated_at
        )
        values (
          ${property.id},
          ${section},
          ${title},
          ${body},
          'published',
          'manual',
          '[]'::jsonb,
          now(),
          now()
        )
        on conflict (property_id, section)
        do update set
          title = excluded.title,
          body = excluded.body,
          status = excluded.status,
          source = excluded.source,
          validation_warnings = excluded.validation_warnings,
          published_at = excluded.published_at,
          updated_at = now()
      `;
    }

    const tourSeed = await seedTourNotificationProof(sql, {
      orgId: org.id,
      propertyId: property.id,
    });
    await writeSeedOutput({
      email,
      widgetId,
      propertyId: property.id,
      tourGuestCardId: tourSeed.guestCardId,
      tourBookingId: tourSeed.tourBookingId,
    });

    console.log(`E2E smoke seed ready: ${email}, widget ${widgetId}, tour guest ${tourSeed.guestCardId}`);
  } finally {
    await sql.end();
  }
}

async function ensureE2eMigrations(sql) {
  const migrationFiles = [
    '0009_phase_a_knowledge_settings_observability.sql',
    '0010_phase_b_tour_settings.sql',
    '0011_phase_b_calendar_availability.sql',
    '0012_phase_b_tour_bookings.sql',
    '0013_phase_b_tour_notifications.sql',
    '0014_phase_b_widget_disclosure.sql',
  ];

  for (const filename of migrationFiles) {
    const body = await readFile(path.resolve(webRoot, '../../packages/db/drizzle', filename), 'utf8');
    await sql.unsafe(body);
  }
}

async function seedTourNotificationProof(sql, input) {
  await sql`
    delete from public.tour_bookings
    where property_id = ${input.propertyId}
      and metadata ->> 'e2eSmoke' = 'tour_notifications'
  `;
  await sql`
    delete from public.guest_cards
    where org_id = ${input.orgId}
      and normalized_email = lower(${tourProspectEmail})
  `;

  await sql`
    insert into public.property_tour_settings (
      property_id,
      enabled_tour_types,
      default_duration_minutes,
      buffer_minutes,
      capacity_per_slot,
      scheduling_window_days,
      tour_hours,
      blackout_dates,
      updated_at
    )
    values (
      ${input.propertyId},
      '["in_person"]'::jsonb,
      30,
      0,
      2,
      14,
      '{"mon":{"open":"09:00","close":"17:00"},"tue":{"open":"09:00","close":"17:00"},"wed":{"open":"09:00","close":"17:00"},"thu":{"open":"09:00","close":"17:00"},"fri":{"open":"09:00","close":"17:00"}}'::jsonb,
      '[]'::jsonb,
      now()
    )
    on conflict (property_id)
    do update set
      enabled_tour_types = excluded.enabled_tour_types,
      default_duration_minutes = excluded.default_duration_minutes,
      buffer_minutes = excluded.buffer_minutes,
      capacity_per_slot = excluded.capacity_per_slot,
      scheduling_window_days = excluded.scheduling_window_days,
      tour_hours = excluded.tour_hours,
      blackout_dates = excluded.blackout_dates,
      updated_at = now()
  `;

  const [guestCard] = await sql`
    insert into public.guest_cards (
      org_id,
      primary_property_id,
      status,
      stage,
      source,
      first_channel,
      full_name,
      email,
      normalized_email,
      email_consent_status,
      marketing_consent_status,
      metadata,
      last_seen_at,
      updated_at
    )
    values (
      ${input.orgId},
      ${input.propertyId},
      'active',
      'tour_scheduled',
      'e2e_seed',
      'website',
      'E2E Tour Prospect',
      ${tourProspectEmail},
      lower(${tourProspectEmail}),
      'subscribed',
      'subscribed',
      '{"e2eSmoke":"tour_notifications"}'::jsonb,
      now(),
      now()
    )
    returning id
  `;

  await sql`
    insert into public.guest_card_property_links (
      guest_card_id,
      property_id,
      source,
      last_seen_at
    )
    values (${guestCard.id}, ${input.propertyId}, 'e2e_seed', now())
    on conflict (guest_card_id, property_id)
    do update set source = excluded.source, last_seen_at = now()
  `;

  const [conversation] = await sql`
    insert into public.conversations (
      property_id,
      guest_card_id,
      channel,
      external_id,
      prospect_name,
      prospect_email,
      status,
      metadata,
      updated_at
    )
    values (
      ${input.propertyId},
      ${guestCard.id},
      'website',
      'e2e-tour-notification-session',
      'E2E Tour Prospect',
      ${tourProspectEmail},
      'converted',
      '{"e2eSmoke":"tour_notifications"}'::jsonb,
      now()
    )
    returning id
  `;

  await sql`
    insert into public.messages (
      conversation_id,
      role,
      author_type,
      content,
      channel,
      metadata
    )
    values (
      ${conversation.id},
      'user',
      'prospect',
      'I want to book a tour.',
      'website',
      '{"e2eSmoke":"tour_notifications"}'::jsonb
    )
  `;

  const [booking] = await sql`
    insert into public.tour_bookings (
      property_id,
      guest_card_id,
      conversation_id,
      tour_type,
      status,
      start_at,
      end_at,
      timezone,
      source,
      metadata,
      updated_at
    )
    values (
      ${input.propertyId},
      ${guestCard.id},
      ${conversation.id},
      'in_person',
      'booked',
      now() - interval '3 hours',
      now() - interval '2 hours 30 minutes',
      'America/Chicago',
      'ai_tool',
      '{"e2eSmoke":"tour_notifications"}'::jsonb,
      now()
    )
    returning id
  `;

  const jobRows = [
    ['tour_confirmation', 'prospect', 'email'],
    ['tour_confirmation', 'leasing_team', 'email'],
    ['tour_reminder', 'prospect', 'email'],
    ['post_tour_follow_up', 'dashboard_task', 'dashboard_task'],
  ];

  for (const [jobType, recipientKind, channel] of jobRows) {
    await sql`
      insert into public.tour_notification_jobs (
        tour_booking_id,
        property_id,
        guest_card_id,
        conversation_id,
        job_type,
        recipient_kind,
        channel,
        status,
        run_at,
        next_attempt_at,
        metadata,
        updated_at
      )
      values (
        ${booking.id},
        ${input.propertyId},
        ${guestCard.id},
        ${conversation.id},
        ${jobType},
        ${recipientKind},
        ${channel},
        'pending',
        now() - interval '1 minute',
        now() - interval '1 minute',
        '{"e2eSmoke":"tour_notifications"}'::jsonb,
        now()
      )
      on conflict (tour_booking_id, job_type, recipient_kind)
      do update set
        status = 'pending',
        attempts = 0,
        sent_at = null,
        last_error = null,
        run_at = excluded.run_at,
        next_attempt_at = excluded.next_attempt_at,
        updated_at = now()
    `;
  }

  return { guestCardId: guestCard.id, tourBookingId: booking.id };
}

async function writeSeedOutput(payload) {
  await mkdir(path.dirname(seedOutput), { recursive: true });
  await writeFile(seedOutput, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

main().catch((error) => {
  console.error(`E2E seed failed: ${error.message}`);
  process.exit(1);
});
