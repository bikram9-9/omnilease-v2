# OmniLease

OmniLease is a leasing assistant for multifamily properties.

The product direction is now:

- `Phase 1`: website chat + Messenger
- `Phase 1 goal`: capture inbound leads, answer from property context + live unit data, and move prospects toward a scheduled tour
- `Phase 2`: phone/SMS

## Current Architecture

The app is a Next.js web app with:

- Markdown files for long-form property context
- Postgres for operational data
- a shared conversation engine used by chat channels

### Property Context

Property context lives on disk in:

`content/properties/<property-slug>/`

Recommended files:

- `overview.md`
- `amenities.md`
- `policies.md`
- `faqs.md`
- `touring.md`

These files are loaded by `apps/web/src/lib/property-context.ts` and fed into the prompt builder.

### Relational Data

Relational data lives in Postgres via Drizzle:

- properties
- unit types
- conversations
- messages
- escalations

The current schema pivot is captured in `packages/db/drizzle/0006_website_messenger_pivot.sql`.

## What Changed In This Pivot

- Removed the SMS-first Twilio webhook path
- Removed TCPA/quiet-hours/opt-out code
- Removed DB-backed `property_knowledge` as the prompt source
- Added property `slug`, `websiteWidgetId`, and `messengerPageId`
- Refactored the prompt builder to use `Markdown + relational unit data`
- Kept the website widget path and aligned it to the new schema

## Local Development

Install deps:

```bash
pnpm install
```

Run tests:

```bash
pnpm test
```

Typecheck:

```bash
pnpm --filter @omnilease/web typecheck
pnpm --filter @omnilease/db typecheck
pnpm --filter @omnilease/shared typecheck
```

## What’s Next

The next product work should focus on:

1. Messenger ingestion via Meta webhooks
2. lead capture and prospect normalization across website + Messenger
3. tour request / scheduling data model and workflow
4. operator UI for reviewing leads and conversations

## Notes

- There is currently no git remote configured for this repo, so pushes must wait until a remote is added.
- `drizzle-kit generate` is currently blocked by an existing snapshot collision in `packages/db/drizzle/meta`, so the latest schema pivot was added as a hand-written migration.
