# OmniLease

OmniLease is a multifamily leasing assistant focused on website chat and Messenger. The current build combines property-specific Markdown context with live unit data from Postgres so the assistant can answer leasing questions, capture leads, and escalate to a human when needed.

## Product Status

Current focus: `Phase 1` foundation for website chat + Messenger

Latest shipped update: `April 16, 2026`

- Pivoted the product away from SMS-first architecture toward website chat + Messenger
- Moved prompt context from DB-managed knowledge rows to Markdown files under `content/properties/<property-slug>/`
- Added `slug`, `websiteWidgetId`, and `messengerPageId` to property records
- Kept the embeddable website widget and streaming chat path as the primary live channel
- Removed active Twilio/TCPA runtime code from the current product direction
- Aligned the conversation engine around Markdown property context plus relational unit inventory

## What Works Today

- Multi-tenant Next.js dashboard shell with auth, onboarding, and property management
- Property CRUD with channel identifiers for website widget and Messenger
- Unit-type management for pricing, availability, deposits, and floorplan metadata
- Markdown-based property context loading for FAQs, policies, amenities, and touring info
- Website widget session bootstrap and streaming chat reply API
- Shared conversation engine with intent classification, tool calling, safety filtering, and escalation hooks
- Drizzle/Postgres schema for properties, unit types, conversations, messages, and escalations

## What Is Next

- Phase 0 acquisition system: content workflow, paid social lead capture, AI DM response, Google review alerts, and funnel reporting
- Messenger webhook ingestion and reply flow
- Lead capture normalization across website and Messenger conversations
- Operator inbox for conversations, escalations, and human takeover
- Tour request and scheduling workflow
- Phase 2 reintroduction of phone and SMS

## Architecture At A Glance

OmniLease is a `pnpm` monorepo with a Next.js web app, shared packages, and content files that act as part of the prompt source of truth.

```text
apps/
  web/                  Next.js 16 app, widget routes, dashboard, auth
packages/
  db/                   Drizzle schema and migrations
  shared/               Shared validators, roles, and auth types
  supabase/             Supabase client helpers
content/
  properties/           Markdown context for each property
docs/
  superpowers/          Product plans and implementation docs
```

The current assistant flow is:

1. Resolve the property from a website widget ID or future Messenger page ID.
2. Load relational property + unit data from Postgres.
3. Load long-form context from `content/properties/<property-slug>/`.
4. Build a system prompt from both sources.
5. Generate or stream a reply through the shared conversation engine.
6. Persist messages, tool calls, and escalations in Postgres.

## Tech Stack

- `Next.js 16` + `React 19`
- `TypeScript`
- `pnpm` workspaces + `Turborepo`
- `Supabase` for Postgres and auth
- `Drizzle ORM` for schema and queries
- `Vercel AI SDK` with AI Gateway model routing
- `Resend` for escalation email delivery
- `Tailwind CSS` + `shadcn/ui`

## Getting Started

### Prerequisites

- `Node.js >= 20`
- `pnpm >= 9`
- A Supabase project or compatible Postgres database
- A Vercel project linked with AI Gateway enabled
- A Resend API key if you want escalation emails to send

### Install

```bash
pnpm install
```

### Configure Environment

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in the required values.

Important variables:

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `EMAIL_FROM`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `APP_URL`

For local email capture with Mailpit, set `SMTP_HOST=127.0.0.1` and `SMTP_PORT=1025`. When `SMTP_HOST` is present, the app sends escalation email over SMTP instead of Resend.

For model access, this repo expects Vercel AI Gateway via OIDC. The intended setup is:

```bash
vercel link
vercel env pull apps/web/.env.local
```

That provisions `VERCEL_OIDC_TOKEN` automatically when AI Gateway is enabled for the linked project.

### Run Migrations

```bash
pnpm db:migrate
```

### Start The App

```bash
pnpm web:dev
```

The web app runs on [http://localhost:3000](http://localhost:3000).

## Property Context Files

Each property's long-form context lives in:

```text
content/properties/<property-slug>/
```

Recommended files:

- `overview.md`
- `amenities.md`
- `policies.md`
- `faqs.md`
- `touring.md`

The app loads whichever of these files exist and combines them with relational unit data when building the model prompt. You can view the resolved directory for a property inside the dashboard.

## Website Widget

The website chat widget is served from `apps/web/public/widget.js` and currently supports:

- Floating launcher + chat panel UI
- Session initialization through `POST /api/widget/session`
- Streaming assistant replies through `POST /api/widget/chat`
- Browser `localStorage` session and transcript persistence
- Per-property branding and welcome message
- Dashboard install snippets and property-level preview frames

Example embed:

```html
<script
  src="https://your-app.example/widget.js"
  data-widget-id="your-widget-id"
  defer
></script>
```

For browser smoke testing, run the app locally. The script uses deterministic
local defaults and seeds a smoke account/property/widget when local Supabase
service credentials are available:

```bash
BASE_URL=http://localhost:3000 pnpm e2e:smoke
```

Default smoke values are `e2e-smoke@omnilease.local`,
`OmniLeaseE2E!2026`, and `wdg_e2e_smoke`. Override `E2E_EMAIL`,
`E2E_PASSWORD`, or `E2E_WIDGET_ID` only when targeting a different environment.
For remote Supabase targets, automatic database seeding is blocked unless
`E2E_ALLOW_REMOTE_SEED=1` is set; the browser flow can still sign up with the
same smoke credentials when the environment allows self-serve signup.

## Useful Commands

```bash
pnpm dev
pnpm build
pnpm test
pnpm test:unit
pnpm test:integration
pnpm typecheck
pnpm ci:verify
BASE_URL=http://localhost:3000 pnpm e2e:smoke
pnpm web:dev
pnpm db:migrate
pnpm db:studio
```

See `docs/testing-standards.md` for the Linear story completion proof required before moving implementation stories to Done.

## Current Roadmap

- `Phase 0`: AI-driven leasing acquisition, content distribution, review alerts, and performance tracking
- `Phase 1a`: core engine and database foundation
- `Phase 1b`: website widget channel
- `Phase 1c`: dashboard conversations, escalations, analytics, and human takeover
- `Phase 2`: phone/SMS, tour scheduling, and follow-up workflows

## Known Caveats

- `drizzle-kit generate` is currently blocked by a snapshot collision in `packages/db/drizzle/meta`, so `packages/db/drizzle/0006_website_messenger_pivot.sql` was added by hand.
- Messenger ingestion is planned but not merged yet.
- The current README describes the active product direction; older SMS-first design ideas still exist in historical specs and earlier branches.
