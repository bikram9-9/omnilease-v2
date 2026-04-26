import { config } from 'dotenv';
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

if (!databaseUrl || !supabaseUrl || !publishableKey) {
  console.log('E2E seed skipped: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, and publishable key are required.');
  process.exit(0);
}

if (!/\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(databaseUrl) && process.env.E2E_ALLOW_REMOTE_SEED !== '1') {
  console.log('E2E seed skipped: refusing to seed a remote database without E2E_ALLOW_REMOTE_SEED=1.');
  process.exit(0);
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
        now()
      )
      on conflict (slug)
      do update set
        name = excluded.name,
        website_widget_id = excluded.website_widget_id,
        escalation_email = excluded.escalation_email,
        welcome_message = excluded.welcome_message,
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

    console.log(`E2E smoke seed ready: ${email}, widget ${widgetId}`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(`E2E seed failed: ${error.message}`);
  process.exit(1);
});
