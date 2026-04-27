# Production Pilot Runbook

This runbook controls OmniLease Release 0, Release 1, and Release 2. Release 1
must not start until every required Phase A gate is complete and the go/no-go
record is signed off.

## Release Gates

### Phase 0: Managed Acquisition Pilot

Purpose: prove OmniLease can create and convert demand before deeper leasing
automation is live for a property.

Required checks:

- Property has approved unit access for filming and named a filming window.
- Pricing, availability, floor plans, amenities, fees, policies, and move-in
  requirements are available and have an update owner.
- Ad budget is approved, with a recommended floor of `$500-$2,000/month`.
- CRM or lead-tracking destination is configured.
- Google review monitoring access is configured or a manual review-alert owner
  is named.
- Human escalation owner is assigned for DMs, low-confidence replies,
  complaints, legal/safety/fair-housing issues, and negative reviews.
- Campaign tracking can report cost per lead, cost per tour, cost per lease when
  available, lead-to-tour conversion, tour-to-lease conversion, response time,
  qualified leads, leases, vacancy days reduced, and review-alert status.

Exit: the property can run a weekly acquisition report tying content, ads,
inbound messages, tours, leases, and reputation alerts to business outcomes.

### Release 0: Internal Staging

Purpose: prove the app can run end to end with internal data before any renter
or leasing team depends on it.

Required checks:

- Fresh install or deploy uses current environment variables.
- Database migrations apply cleanly to staging.
- Widget session creation and chat response work for the seed property.
- Conversation inbox shows messages, escalation state, guest card link, and
  human takeover state.
- Escalation email delivery is verified with a test escalation.
- AI outage, DB outage, widget outage, and rollback runbooks have named owners.
- `pnpm ci:verify` or equivalent fresh lint, typecheck, unit, integration, and
  build commands pass.
- Browser smoke covers public pages, auth guard, dashboard routes if credentials
  are available, and widget host if `E2E_WIDGET_ID` is configured.

Exit: internal team can reproduce the happy path and one failure path without
manual database edits.

### Release 1: Controlled Production Pilot

Purpose: allow one pilot property to run website leasing chat with human review.

Hard blockers:

- Widget install and preview are complete.
- Session continuity and transcript behavior are verified.
- Inbox human takeover and reply flow are complete.
- Lead or guest-card profile is linked to conversations.
- Property knowledge has been reviewed and has no empty critical sections.
- Assistant settings have been reviewed for tone, goals, screening questions,
  selling points, escalation rules, and fair-housing guardrails.
- Baseline analytics or operational logs show conversation volume, lead capture,
  escalation rate, AI/tool failures, and unanswered reasons.
- LLM golden evals pass the minimum threshold named in the go/no-go record.
- Launch and allowlist testing checklist is complete (`docs/launch-checklist.md`).
- Escalation email, auth, widget install, and seed/test conversations are
  verified on the pilot property.
- Rollback and outage runbooks have been tabletop-tested and owner-approved.

Exit: the pilot property is live only for the agreed allowlist or production
surface, with a named human owner watching the inbox and escalation channel.

### Release 2: Paid Leasing Pilot

Purpose: expand from controlled production use into a paid leasing pilot.

Required checks:

- Release 1 has at least one completed operating window with reviewed
  conversations and no unresolved P0/P1 incidents.
- Human takeover, escalation delivery, and AI-off fallback have real production
  evidence.
- Tour conversion, quote, application, fee disclosure, or other Phase B scope is
  explicitly approved for the paid pilot.
- Support, rollback, and customer communication owners are assigned.
- Pilot success metrics and renewal/expansion criteria are documented.

## Pilot Readiness Checklist

Complete this checklist before Release 1.

- Property record has name, timezone, brand color, website widget ID, and
  escalation email.
- Property content covers overview, amenities, policies, pets, fees, parking,
  application process, office hours, and touring expectations.
- Empty or unknown knowledge sections are either filled or explicitly marked as
  "escalate to human".
- Assistant settings are reviewed for primary goal, tone, CTA, screening
  questions, selling points, escalation triggers, and safety guardrails.
- Widget snippet is installed on the pilot test page.
- Widget preview opens, starts a session, sends a message, streams a response,
  and preserves session ID across reload.
- Seed conversations include pricing, availability, pets, fees, amenities,
  tours, fair-housing edge cases, and human handoff.
- Dashboard auth works for at least one admin or manager and one leasing agent
  if role coverage is in scope.
- Inbox shows conversation history, guest card or lead link, escalation state,
  takeover state, and human reply composer.
- Escalation email reaches the expected mailbox.
- AI outage fallback and DB outage support path are understood by the owner.
- Go/no-go owner, backup owner, launch window, and rollback window are named.

## Go/No-Go Record

Copy this block into the release issue or Linear project document.

```markdown
Release:
Target property:
Launch window:
Go/no-go owner:
Backup owner:
Support owner:
Rollback owner:

Required evidence:
- Phase A stories complete:
- Fresh verification command:
- Browser/widget smoke evidence:
- LLM eval pass rate:
- Escalation email test:
- Human takeover test:
- Seed conversation review:
- Pilot readiness checklist:
- Rollback tabletop:
- Outage tabletop:

Decision:
- [ ] Go
- [ ] No-go

Reason:
Follow-up actions:
Sign-off:
```

## Deploy Runbook

Owner: release owner.

Current infrastructure status:

- Vercel is linked to project `omnilease-web`
  (`prj_BXpKfbMqKqRhZy2Rjreb13OVmcrT`) in org
  `team_gHfRnmYMZc5cJQDTru1ANFvg`.
- Vercel root directory is `apps/web`.
- Supabase CLI is linked to project `omnilease-service-v2`
  (`dnammstsshoixbvnbxxa`) on branch `main`.
- Production cron is configured in `apps/web/vercel.json` for
  `/api/cron/tour-notifications` once per day at 14:00 UTC. This is
  deploy-safe on Vercel Hobby. On Pro, change the schedule to `*/15 * * * *`
  if tour notifications need near-real-time processing.

Required Vercel environment variables:

- `DATABASE_URL`: Supabase pooler connection string for serverless runtime.
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Supabase browser/server SDK public key.
- `RESEND_API_KEY`: Resend production API key.
- `RESEND_FROM_EMAIL`: sender identity, recommended
  `Omnilease <info@omnilease.ai>`.
- `EMAIL_FROM`: sender identity used by the mail helper, recommended
  `Omnilease <info@omnilease.ai>`.
- `APP_URL`: canonical hosted app URL.
- `TOUR_NOTIFICATION_CRON_SECRET`: random bearer secret for the tour
  notification cron route.
- `OMNILEASE_AI_MODEL`: model string for Vercel AI Gateway. Default is
  `anthropic/claude-sonnet-4.6`.

Do not set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, or `EMAIL_DELIVERY_MODE=log`
in production. If `SMTP_HOST` exists, it takes precedence over Resend.

Environment setup commands:

```bash
vercel env ls
vercel env add RESEND_API_KEY production
vercel env add RESEND_API_KEY development
vercel env add RESEND_FROM_EMAIL production
vercel env add RESEND_FROM_EMAIL development
vercel env add EMAIL_FROM production
vercel env add EMAIL_FROM development
vercel env add APP_URL production
vercel env add TOUR_NOTIFICATION_CRON_SECRET production
vercel env add OMNILEASE_AI_MODEL production
vercel env add OMNILEASE_AI_MODEL development
vercel env pull apps/web/.env.local --yes
```

For Preview deployments, add the same variables with
`vercel env add <NAME> preview <git-branch>` after choosing the branch and
staging database strategy.

Pre-flight:

1. Confirm the target environment and branch.
2. Confirm the migration list and whether any manual SQL must be applied.
3. Confirm `DATABASE_URL`, Supabase URL/keys, AI Gateway credentials, Resend
   credentials, `APP_URL`, and widget host origin.
4. Run fresh verification: `pnpm ci:verify`.
5. Run browser smoke with the target URL and credentials when available:
   `BASE_URL=<target> E2E_EMAIL=<email> E2E_PASSWORD=<password> pnpm e2e:smoke`.
6. Confirm the pilot property has readiness checklist approval.

Deploy:

1. Deploy the approved branch.
2. Apply migrations.
3. Open the public app and sign-in page.
4. Sign in as an operator.
5. Open the pilot property, conversation inbox, and widget preview/test page.
6. Send a seed widget message.
7. Verify the response appears in the widget and inbox.
8. Trigger or simulate a handoff and send one human reply from the inbox.
9. Trigger or simulate an escalation email.
10. Record evidence in the go/no-go record.

Cron verification:

```bash
curl -i "$APP_URL/api/cron/tour-notifications?limit=1" \
  -H "Authorization: Bearer $TOUR_NOTIFICATION_CRON_SECRET"
```

Expected result: HTTP 200 with JSON containing `"ok":true`. A request without
the bearer token must return HTTP 401 in production.

Abort conditions:

- Migration fails.
- Sign-in is broken.
- Widget cannot start a session.
- AI replies cannot be suppressed during takeover.
- Escalation email cannot be delivered.
- DB writes fail or conversations do not appear in the inbox.

## Rollback Runbook

Owner: rollback owner.

Rollback trigger:

- P0/P1 incident during launch.
- Data write corruption or migration issue.
- Widget outage on pilot site.
- Auth outage for operators.
- AI sends unsafe or uncontrollable responses and AI-off fallback cannot be
  confirmed.

Steps:

1. Disable or remove the widget snippet from the pilot page if renter impact is
   active.
2. Set the pilot property to human-reviewed operation by taking over active
   conversations or disabling the public widget entry point.
3. Revert the app deployment to the last known good build.
4. If the migration is backward compatible, leave data in place and verify the
   old build can read it.
5. If a migration requires data rollback, stop writes first, snapshot affected
   tables, and run the approved rollback SQL.
6. Verify sign-in, dashboard inbox, property page, and widget session endpoint.
7. Notify the pilot owner with impact, current state, and next check-in time.
8. Open or update the incident issue with timeline, commands, and evidence.

Manual tabletop test:

- Walk the rollback owner through steps 1-8 before Release 1.
- Confirm the owner knows where the widget snippet, deployment rollback, and
  database snapshot controls live.
- Record the dry-run date and owner in the go/no-go record.

## AI Outage Runbook

Symptoms:

- AI Gateway request failures.
- High latency or timeout from model calls.
- Model returns empty or malformed output.

Steps:

1. Confirm whether `/api/widget/chat` is receiving inbound messages.
2. Take over active pilot conversations from the dashboard.
3. Post or send manual responses for urgent renter messages.
4. Check AI provider status and app logs for model, latency, and error fields.
5. If failures persist, keep conversations in human takeover and pause public
   widget launch expansion.
6. Record affected conversation IDs and timestamps.

Recovery:

- Send a seed widget message after provider recovery.
- Confirm AI response persists and appears in the inbox.
- Return only reviewed conversations to AI.

## DB Outage Runbook

Symptoms:

- Session creation or chat route returns 5xx.
- Dashboard routes fail while loading org, properties, conversations, messages,
  or guest cards.
- Migrations fail or connection pool errors appear.

Steps:

1. Check Supabase status and database connection logs.
2. Stop launch expansion and notify the pilot owner.
3. Remove or pause the widget if renter-facing errors are active.
4. Avoid repeated migration attempts until connectivity is stable.
5. Restore from backup only after confirming data corruption or unrecoverable
   migration failure.
6. After recovery, verify sign-in, property load, widget session, inbound
   message persistence, inbox rendering, and human reply persistence.

## Escalation Delivery Runbook

Symptoms:

- Escalation row exists but no email is received.
- Resend returns an error or delivery is delayed.
- Property has no escalation email.

Steps:

1. Check the property escalation email value.
2. Confirm the escalation row has reason, priority, and conversation ID.
3. Check Resend API status and delivery logs.
4. If email is unavailable, route through the named support owner manually.
5. Keep affected conversations in human takeover until delivery is confirmed.
6. Record failed provider response and affected conversation IDs.

Recovery:

- Send a test escalation after configuration or provider recovery.
- Confirm delivery to the expected mailbox.

## Widget Outage Runbook

Symptoms:

- Widget script fails to load.
- Session endpoint rejects a known widget ID.
- Chat endpoint fails or never streams a response.
- Transcript/session continuity breaks after reload.

Steps:

1. Open the widget host page and browser console.
2. Confirm the script URL and `data-widget-id`.
3. Call `/api/widget/session` for the widget ID.
4. Send a seed message through `/api/widget/chat`.
5. Check property `websiteWidgetId`, CORS/origin assumptions, app logs, and DB
   conversation rows.
6. If public renter impact is active, remove or hide the widget and route users
   to the property's normal contact path.
7. Re-enable only after session, message persistence, AI or takeover behavior,
   and transcript reload all pass.

## Manual Tabletop Log

Use this before Release 1.

| Scenario | Owner | Dry-run date | Result | Evidence link |
| --- | --- | --- | --- | --- |
| Deploy |  |  |  |  |
| Rollback |  |  |  |  |
| AI outage |  |  |  |  |
| DB outage |  |  |  |  |
| Escalation delivery outage |  |  |  |  |
| Widget outage |  |  |  |  |
