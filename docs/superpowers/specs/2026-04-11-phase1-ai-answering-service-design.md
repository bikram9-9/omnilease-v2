# Phase 1 — AI Answering Service (Web) Design

> **Status:** Approved design, ready for implementation planning
> **Date:** 2026-04-11
> **Spec source of truth:** `new-omnilease-spec.md` (April 2026, v1.0 MVP)
> **Predecessor plan:** `docs/superpowers/plans/2026-04-04-phase1-foundation.md` (partially executed)

## 1. Purpose

Build the Phase 1 MVP of the AI answering / leasing assistant described in
`new-omnilease-spec.md` — on top of the existing `apps/web` Next.js 16
codebase — so that one pilot multifamily property can handle prospect SMS and
webchat conversations 24/7 with automatic escalation to a human manager.

Phase 1 ends when a property manager can:

1. Log into the dashboard, configure a property's knowledge base (already
   built).
2. Receive prospect SMS and webchat messages through a Twilio number and an
   embedded widget respectively.
3. See Claude respond automatically, with the property's pricing, pets,
   parking, amenities, and FAQs in context.
4. See conversations stream live in the dashboard, reply as a human when
   they want to take over, and get paged by email when the AI escalates.

## 2. Scope

### 2.1 In scope (Phase 1)

- Mobile app cleanup (delete `apps/mobile/`, rewrite auto-memory)
- Role enum migration: `worker | property_manager | supervisor_manager | admin`
  → `admin | manager | agent`
- Twilio SMS inbound webhook + signature verification + outbound send
- Webchat widget: lean embeddable JS, brand color, no pre-chat form
- Conversation engine: AI Gateway + `anthropic/claude-sonnet-4.6`, system
  prompt builder from property knowledge, tool calls for
  `collect_prospect_info`, `check_availability`, `escalate_to_human`
- Fair-housing + PII safety filter
- TCPA compliance primitives: opt-out table, quiet-hours enforcement,
  first-message disclosure + consent log
- Escalation engine: detect, persist, email agent via Resend
- Dashboard: conversations list + detail with Supabase Realtime, agent reply
  composer (full human takeover), escalation queue, basic analytics
- Migrations for new tables + schema changes

### 2.2 Out of scope (deferred to Phase 2+)

- Email channel (SendGrid inbound parse)
- Tour scheduling (Google Calendar)
- Follow-up sequences
- Multi-property polish + onboarding wizard
- Conversion funnel analytics
- Agent mobile notifications
- Slack notifications
- SMS-to-agent notifications
- Voice / IVR
- PMS integration (AppFolio / Entrata)
- Feature flags (Vercel Flags)
- Vercel Services split (backend / widget separation)
- Pre-chat form on the widget (intentionally replaced by the
  `collect_prospect_info` tool call)
- BullMQ / Redis / separate worker process (replaced by Next.js `after()` on
  Fluid Compute)

## 3. High-Level Architecture

Single Next.js 16 app deployed on Vercel, using Fluid Compute route handlers,
Supabase Postgres (with Realtime and RLS), AI Gateway for Claude, Twilio for
SMS, and Resend for escalation email.

```
Prospect (SMS / webchat)
        │
        ▼
Twilio webhook  ──or──  /api/widget/chat (SSE)
        │                      │
        ▼                      ▼
   Next.js Route Handler (Fluid Compute)
        │
        │  1. verify signature / widget session
        │  2. resolve property from phone / widget_id
        │  3. load/create conversation + persist inbound message
        │  4. ACK immediately (empty TwiML for Twilio; SSE stream for widget)
        │  5. after(() => processConversation(...))
        ▼
processConversation:
   - build system prompt from property_knowledge + unit_types
   - load history (last 20 turns)
   - AI Gateway → anthropic/claude-sonnet-4.6
   - route tool calls (escalate / collect_info / check_availability)
   - apply safety filter
   - persist assistant message
   - send reply (Twilio Messages API / SSE push)
   - if escalated → Resend email to assigned agent

Dashboard (Next.js server components + Supabase Realtime)
   - conversations list, detail, composer
   - escalation queue
   - analytics
```

### 3.1 Key deviations from `new-omnilease-spec.md`

The spec was written assuming a Node + BullMQ + Redis + Railway/Render stack
with a separate worker. The actual codebase is Next.js 16 on Vercel. This
design adapts the spec to the real stack without dropping any functional
Phase 1 requirement.

| Spec says                         | Phase 1 reality                                      | Why                                                        |
|-----------------------------------|------------------------------------------------------|------------------------------------------------------------|
| BullMQ + Redis + worker process   | Next.js `after()` + Fluid Compute                    | Pilot volume fits in one function; fewer moving parts      |
| Railway / Render hosting          | Vercel                                               | Codebase is already a Next.js app                          |
| WebSocket widget                  | SSE via AI SDK `toUIMessageStreamResponse()`         | Strictly better on Vercel; no upgrade handshake needed     |
| Raw Anthropic SDK                 | AI Gateway via `model: 'anthropic/claude-sonnet-4.6'` + OIDC | No API key management, failover, observability    |
| Clerk auth                        | Supabase Auth (already wired in code)                | Functionally equivalent, already implemented               |
| Escalation via SMS + email + Slack | Resend email only                                   | Pilot customer doesn't need three channels (see §9 Q5)     |
| Pre-chat form on widget           | `collect_prospect_info` tool call                    | Better UX; the LLM asks for name/email naturally           |
| `claude-sonnet-4-20250514` model  | `anthropic/claude-sonnet-4.6`                        | Current model as of April 2026                             |
| Roles: `Admin | Manager | Agent`  | `admin | manager | agent` (migration)               | Matches spec; removes dead `worker` value                  |

Every Phase 1 functional requirement from the spec is satisfied by this
adapted architecture. Nothing is dropped — only the transport and deployment
choices are modernized.

## 4. File Layout & Module Boundaries

```
apps/web/
├── public/
│   └── widget.js                          # self-contained embeddable chat widget
│
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── webhooks/twilio/sms/route.ts
│   │   │   ├── webhooks/twilio/sms/status/route.ts
│   │   │   └── widget/
│   │   │       ├── session/route.ts
│   │   │       └── chat/route.ts
│   │   │
│   │   └── (dashboard)/
│   │       ├── conversations/
│   │       │   ├── page.tsx
│   │       │   ├── actions.ts
│   │       │   └── [id]/
│   │       │       ├── page.tsx
│   │       │       └── composer.tsx
│   │       ├── escalations/
│   │       │   ├── page.tsx
│   │       │   └── actions.ts
│   │       └── analytics/
│   │           └── page.tsx
│   │
│   ├── lib/
│   │   ├── twilio/
│   │   │   ├── client.ts
│   │   │   ├── verify.ts
│   │   │   └── send.ts
│   │   ├── conversation/
│   │   │   ├── engine.ts
│   │   │   ├── system-prompt.ts
│   │   │   ├── history.ts
│   │   │   ├── tools.ts
│   │   │   ├── safety.ts
│   │   │   ├── intent.ts
│   │   │   └── escalate.ts
│   │   ├── email/
│   │   │   └── resend.ts
│   │   ├── tcpa/
│   │   │   ├── opt-outs.ts
│   │   │   └── quiet-hours.ts
│   │   └── realtime/
│   │       └── supabase-subscribe.ts
│   │
│   └── components/
│       └── conversations/
│           ├── message-list.tsx
│           └── live-message-list.tsx
│
packages/
├── db/src/schema/
│   ├── tenancy.ts                         # role enum migration
│   ├── tcpa.ts                            # NEW: sms_opt_outs, consent_records
│   └── conversations.ts                   # existing
│
└── shared/src/
    └── roles.ts                           # REWRITTEN: admin | manager | agent
```

### 4.1 Boundary rules

- `lib/conversation/engine.ts` is the only entry point for turning an inbound
  message into an outbound reply. Both the Twilio webhook and the widget
  chat route call it. Neither route handler knows anything about Claude,
  tools, or property knowledge.
- `lib/twilio/*` is the only place that imports the `twilio` SDK. Tests mock
  at the `sendSms` boundary, not at the Twilio SDK itself.
- `lib/conversation/system-prompt.ts` is a pure function —
  `(property, knowledge, unitTypes) → string` — no DB or network. Unit-tested
  with fixtures.
- `lib/tcpa/*` guards every outbound path. `sendSms` refuses to send if
  `isOptedOut` or `isWithinQuietHours` unless the message is a direct reply
  inside an active conversation window (≤ 15 minutes from inbound).
- Widget (`public/widget.js`) is hand-written ES module — no build step, no
  React. Talks to `/api/widget/chat` via `fetch` with SSE.

## 5. Data Model Changes

Migration file: `packages/db/drizzle/0003_phase1_conversation_runtime.sql`.

### 5.1 Role enum migration

```sql
UPDATE users SET role = 'admin'   WHERE role = 'admin';
UPDATE users SET role = 'manager' WHERE role IN ('supervisor_manager', 'property_manager');
UPDATE users SET role = 'agent'   WHERE role = 'worker';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'manager', 'agent'));
```

`packages/shared/src/roles.ts` is rewritten with the new enum and reduced
helpers: `canManageOrg(role)` (admin only), `canEditProperty(role)` (admin +
manager), `canReplyToConversation(role)` (any of the three).

### 5.2 New tables — `packages/db/src/schema/tcpa.ts`

```ts
sms_opt_outs {
  id           uuid pk
  property_id  uuid fk properties
  phone        text not null         // E.164
  keyword      text                   // STOP | UNSUBSCRIBE | CANCEL | END | QUIT
  opted_out_at timestamptz default now()
  unique (property_id, phone)
}

consent_records {
  id            uuid pk
  property_id   uuid fk properties
  phone         text not null
  source        text not null         // 'first_contact' | 'manual' | 'widget'
  consent_text  text not null         // snapshot of disclosure shown
  created_at    timestamptz default now()
  unique (property_id, phone)
}
```

### 5.3 `messages.author_type`

```sql
ALTER TABLE messages ADD COLUMN author_type text
  CHECK (author_type IN ('ai', 'human_agent', 'prospect'))
  NOT NULL DEFAULT 'ai';
```

Backfill: `role='assistant'` → `'ai'`; `role='user'` → `'prospect'`.
Distinguishes human takeover replies from AI output for viewer badging and
automation-rate analytics.

### 5.4 `properties` additions

```sql
ALTER TABLE properties ADD COLUMN brand_color       text;  -- widget accent
ALTER TABLE properties ADD COLUMN escalation_email  text;  -- Resend recipient
ALTER TABLE properties ADD COLUMN welcome_message   text;  -- widget greeting
```

### 5.5 Supabase RLS

Enable RLS on `conversations`, `messages`, `escalations`, `sms_opt_outs`,
`consent_records`. Policies scoped via join:
`properties.org_id = (auth.jwt() ->> 'org_id')`. Mirror the existing
`properties` policy pattern.

### 5.6 Supabase Realtime publication

Add `messages` and `escalations` to the Realtime publication so the dashboard
can subscribe with RLS filtering enforced.

### 5.7 Explicitly not changed

- No `tour_bookings` table — Phase 2.
- No `users.slack_webhook` or `users.phone` — email-only escalation.
- No `users.properties UUID[]` — per-property user scoping comes in Phase 2.

## 6. Conversation Engine Flow

### 6.1 Inbound SMS path — `/api/webhooks/twilio/sms/route.ts`

```
1. verifyTwilioSignature(req)   → fail → 403
2. property = lookupPropertyByTwilioPhone(To)
   miss → 200 no-op (wrong number; don't error-page Twilio)
3. if isOptedOut(property.id, From) → 200 no-op
4. if body ∈ { STOP, UNSUBSCRIBE, CANCEL, END, QUIT }
   → markOptedOut + send one-time ack + 200 done
5. conversation = getOrCreateConversation({
     property, externalId: From, channel: 'sms'
   })
6. insert messages row { role:'user', author_type:'prospect', content:body, channel:'sms' }
7. if first contact: insert consent_records row
8. return new Response('<Response/>', {
     status: 200,
     headers: { 'content-type': 'text/xml' }
   })
9. after(() => processConversation({ conversation, property, inbound: body }))
```

`after()` (from `next/server`) keeps the Twilio ACK fast while the LLM call
runs in the background on Fluid Compute. `export const maxDuration = 300`
on the route gives the async work 5 minutes of headroom.

### 6.2 Widget path — `/api/widget/chat/route.ts`

```
1. property     = lookupPropertyByWidgetId(widgetId)
2. conversation = getOrCreateConversation({
     property, externalId: sessionId, channel: 'webchat'
   })
3. insert messages row (prospect)
4. return toUIMessageStreamResponse(
     streamText({
       model: 'anthropic/claude-sonnet-4.6',   // AI Gateway (OIDC)
       system: buildSystemPrompt(property, knowledge, unitTypes),
       messages: convertToModelMessages(history + current),
       tools: conversationTools,
       stopWhen: stepCountIs(4),
       onFinish: ({ text, toolCalls, usage }) =>
         persistAssistantTurnAndHandleTools(...)
     })
   )
```

SMS uses `generateText` (inside `after()`); widget uses `streamText` (wrapped
by `toUIMessageStreamResponse`). Both paths share `buildSystemPrompt`,
`loadHistory`, `tools`, `safety`, and `escalate`.

### 6.3 System prompt — `lib/conversation/system-prompt.ts`

Pure function. Assembles:

- **Base instructions** — role, tone, fair-housing rules (never reference
  protected classes, never steer, never use loaded phrases like
  "family-friendly" or "quiet community")
- **Property context** — name, address, timezone, office hours, unit types
  (name, beds/baths, sqft range, price range, availability count), knowledge
  blocks rendered per category (pricing, pets, parking, amenities,
  lease_terms, move_in_costs, utilities, neighborhood, faqs)
- **Available actions** — answer from context, call tools when appropriate,
  escalate on explicit request / fair housing / complaint / pricing
  negotiation / low confidence
- **Response format** — 2–3 sentences for SMS, natural property name
  reference, soft CTA, never invent pricing or availability

No runtime network calls inside the builder.

### 6.4 Tools — `lib/conversation/tools.ts`

AI SDK v6 `inputSchema` (not v5 `parameters`). Three tools:

1. `collect_prospect_info({ name?, email?, phone?, moveInDate?, unitPreference? })`
   — UPDATE conversations row, return `{ ok: true }`.
2. `check_availability({ bedrooms?, maxPrice? })`
   — query `unit_types`, return matching rows. Multi-step via
   `stopWhen: stepCountIs(4)`.
3. `escalate_to_human({ reason, priority })`
   — write `escalations` row, flip `conversations.status = 'escalated'`,
   send Resend email to `property.escalation_email`, return a canned
   acknowledgement string.

### 6.5 Safety filter — `lib/conversation/safety.ts`

Runs after LLM output, before persist + send:

1. Regex pass for blocked phrases — if matched, replace with a fallback
   reply and flag `messages.metadata.safety_flag = true`.
2. PII scrub — strip SSN / credit card / address-like content the LLM echoed
   back.
3. Confidence check — if `finishReason` is unusual or output contains
   hedging markers, set `confidence_score < 0.7` and auto-escalate.

### 6.5a Intent classification

Before each LLM call, the engine classifies the inbound prospect message
into one of a fixed set of intents — `pricing`, `pets`, `parking`,
`amenities`, `tour`, `application`, `availability`, `complaint`,
`other` — via a local keyword matcher (`lib/conversation/intent.ts`). No
extra LLM call. The matcher is a small regex / keyword table; "good
enough" for the top-intents analytics card. The detected intent is
written to the inbound message row as `messages.metadata.intent`.

### 6.6 Outbound send — `lib/twilio/send.ts`

`sendSms(propertyId, toPhone, body, { directReply: boolean })`:

1. `isOptedOut` → throw `OptedOutError`.
2. If `!directReply` and `isWithinQuietHours(property.timezone)` → throw
   `QuietHoursError`.
3. `twilio.messages.create({ from: property.twilio_phone, to, body })`.
4. Insert `messages` row with `author_type = 'ai' | 'human_agent'`.
5. On error, log via Vercel Logs + write `messages.metadata.send_error`.

`directReply` is `true` when the outbound is within 15 minutes of an inbound
in the same conversation — TCPA permits these even in quiet hours.

### 6.7 Widget outbound

The SSE stream from `streamText` *is* the outbound — browser receives tokens
as generated. `onFinish` persists the final assistant row. No Twilio call.

### 6.8 Human takeover

Dashboard composer → `sendAgentReply(conversationId, body)` server action:

1. `requireOrg()` + `canReplyToConversation(role)` check.
2. Load conversation, assert same org.
3. If channel is `sms` → `sendSms(..., { directReply: true })` with
   `author_type = 'human_agent'`.
4. If channel is `webchat` → insert `messages` row directly. The widget
   subscribes to a Supabase Realtime channel (scoped by an anon JWT from
   `/api/widget/session`) and receives the new message on its open
   connection.
5. `revalidatePath(`/conversations/${id}`)`.

## 7. Dashboard

### 7.1 `(dashboard)/conversations/page.tsx` — list

Server component. Loads conversations for the org, joined to latest message
preview. Filters via async `searchParams`:
- `propertyId`, `status`, `channel`, `q` (preview full-text), `cursor`.
Columns: Prospect, Property, Channel icon, Preview, Status badge, Updated-at.

### 7.2 `(dashboard)/conversations/[id]/page.tsx` — detail

Server component loads header + initial messages, hands off to a client
`LiveMessageList` that subscribes to Supabase Realtime on
`public.messages` filtered by `conversation_id`. Falls back to a 5-second
poll on disconnect.

Layout:
- Prospect header (name/phone/email, move-in date, unit preference)
- Badges (status, channel, assigned agent)
- Actions (Assign, Close, Mark converted)
- Message list, differentiated by `author_type`
  - `prospect` — left-aligned, muted bubble
  - `ai` — right-aligned with an "AI" tag
  - `human_agent` — right-aligned with agent name
- Composer — textarea + "Send as agent" button; disabled when closed;
  warns outside quiet hours for outbound SMS

### 7.3 Server actions — `conversations/actions.ts`

```
sendAgentReply(conversationId, body)
assignConversation(conversationId, userId)
closeConversation(conversationId)
markConverted(conversationId)
```

All go through `requireOrg()` first.

### 7.4 `(dashboard)/escalations/page.tsx` — queue

Filtered list (`resolved_at IS NULL`) joined to conversation + property,
grouped by priority. Rows link to their conversation. "Resolve" action
closes the escalation (optional notes) but does not close the conversation.

### 7.5 `(dashboard)/analytics/page.tsx` — basic analytics

Four cards + two charts, all from SQL on existing tables:

1. **Conversations (last 30 days)** — count, split by channel
2. **Median AI response time** — time between last `role='user'` and next
   `role='assistant', author_type='ai'` (median over 30 days)
3. **Automation rate** — `never-escalated / total`
4. **Escalation rate** — inverse
5. Bar chart: conversations per day (30 days)
6. Bar chart: top intents — frequency over `messages.metadata.intent`

Lead conversion and tour booking rate are Phase 2 (require tour data).

### 7.6 Navigation

Sidebar gains three items:
```
Dashboard
Conversations    ← new
Escalations      ← new
Analytics        ← new
Properties
Settings
```

### 7.7 Realtime wiring — `lib/realtime/supabase-subscribe.ts`

`useLiveMessages(conversationId)` hook:
- Subscribe to `postgres_changes` on `public.messages` filtered by
  `conversation_id=eq.{id}`
- On INSERT, merge into local state
- On disconnect, poll `/api/conversations/:id/messages/since?cursor=`
- RLS scopes the channel; the browser sees only its org's messages

## 8. Testing & Verification

Tests hit a real Supabase instance (local `supabase start` for dev, a
dedicated `omnilease-test` project for CI). Per project convention, we do
not mock Supabase or Drizzle.

### 8.1 Unit tests (Vitest)

- `lib/conversation/system-prompt.test.ts` — snapshot-assert assembled
  prompt, assert fair-housing rules included, assert inactive unit types
  excluded
- `lib/conversation/safety.test.ts` — blocked phrase detection, PII scrub,
  confidence routing
- `lib/tcpa/opt-outs.test.ts` — STOP keyword matching, opt-out persistence
- `lib/tcpa/quiet-hours.test.ts` — timezone-aware logic + 15-minute direct
  reply window
- `lib/twilio/verify.test.ts` — signature verification with canned payloads

### 8.2 Integration tests (Vitest, real Supabase)

- `engine.int.test.ts` — full `processConversation` with fixture property;
  AI Gateway mocked at `generateText` boundary; asserts messages rows,
  tool call persistence, escalation row creation
- `webhook.int.test.ts` — POST canned Twilio payload, assert 200 TwiML +
  scheduled `after()` work runs + `sendSms` called correctly
- `widget.int.test.ts` — POST to `/api/widget/chat`, consume SSE, assert
  final persisted turn
- Cross-org isolation test — insert messages for two orgs, subscribe
  Realtime as each, assert no leakage

### 8.3 E2E tests (Playwright)

- `e2e/prospect-sms.spec.ts` — simulate Twilio webhook, logged-in manager
  sees conversation appear live via Realtime
- `e2e/human-takeover.spec.ts` — agent types in composer, asserts
  `author_type='human_agent'` persistence + mocked Twilio send
- `e2e/widget-happy-path.spec.ts` — embed widget in test page, type
  message, see streamed reply, verify final row

### 8.4 Mocking boundaries

| Mocked                            | Not mocked                     |
|-----------------------------------|--------------------------------|
| AI Gateway (`generateText` / `streamText`) | Supabase + Drizzle    |
| Twilio `messages.create` (at `lib/twilio/client.ts`) | Next.js route handlers |
| Resend `emails.send` (at `lib/email/resend.ts`)      | Supabase Realtime |

Signature verification tests use real canned Twilio payloads, not mocks.

### 8.5 Verification checklist before Phase 1 is complete

1. `pnpm typecheck` passes across the workspace
2. `pnpm test` (unit + integration) passes against local Supabase
3. `pnpm e2e` passes
4. Manual dev-server smoke: `next dev`, run `agent-browser-verify` on
   `/conversations` — page loads, no console errors
5. Deploy to Vercel preview, run Twilio's webhook test tool against the
   preview, confirm a real SMS round trip with one test number
6. Vercel function logs clean — no unhandled rejections, no
   `OptedOutError` when sending to allowed prospects

## 9. Risks & Mitigations

### 9.1 `after()` + LLM duration on the SMS path

**Risk:** `after()` work exceeding the route's execution budget could be
cut off on cold instances.

**Mitigation:** Set `export const maxDuration = 300` on the SMS route, cap
LLM `max_tokens` at 300, instrument timing via Vercel Logs from day one.
Alert if p95 > 10 s.

### 9.2 Supabase Realtime + RLS on `messages`

**Risk:** Realtime filters run after RLS, so a bad policy leaks messages
across orgs.

**Mitigation:** Cross-org isolation integration test (§8.2) runs on every
CI build. Any RLS change triggers the test suite.

### 9.3 Twilio signature verification on preview deployments

**Risk:** Twilio computes the signature against the exact URL, which
varies per preview deploy.

**Mitigation:** Pin Twilio's webhook to the production URL. Preview testing
uses a local tunnel (ngrok / cloudflared).

### 9.4 Fair-housing false negatives in the safety filter

**Risk:** Regex-only blocking misses paraphrased violations.

**Mitigation:** Lean on system-prompt guardrails (LLM self-censors), flag
suspicious outputs into a review queue, quarterly manual audit — which
matches spec section 7.1.

### 9.5 TCPA quiet-hours edge case

**Risk:** A prospect texts at 10pm local; the AI reply timestamps outside
quiet hours. Replies inside active conversations are legal, but the code
must distinguish them from proactive outbound.

**Mitigation:** `directReply` flag in `sendSms`, 15-minute window logic,
dedicated test case in `quiet-hours.test.ts`.

### 9.6 Widget session hijack

**Risk:** Widget sessions are identified by a cookie / localStorage token.
If a prospect shares their browser, another user could resume the session.

**Mitigation:** Bind sessions to IP+UA hash for expiry decisions; accept
the residual risk — this is web chat, not banking.

## 10. Open Items (non-code gates)

These block the pilot go-live but cannot be resolved by code alone. The
implementation plan will include checklist tasks for each.

- **Brand name & domain** (`new-omnilease-spec.md` §12.1). Must be decided
  before the Vercel project is renamed.
- **Twilio phone number purchase** — human must click this in Twilio's
  console and configure the inbound webhook URL.
- **Resend domain verification** — DKIM / SPF records must be set on the
  sender domain.
- **AI Gateway enablement** — `vercel link` → enable AI Gateway in the
  Vercel dashboard → `vercel env pull` to get the OIDC token locally.
- **Legal review of system prompt** (`new-omnilease-spec.md` §12.4). Final
  system prompt text must be reviewed before first pilot go-live.

## 11. Success Criteria

Phase 1 is complete when:

1. All functional requirements in spec sections FR-1, FR-2.1, FR-2.2, FR-4,
   FR-5, FR-6 are implemented and covered by tests.
2. TCPA and fair-housing compliance primitives (spec §7.1, §7.2) are in
   place and tested.
3. A fresh checkout can: `pnpm install` → `pnpm db:push` against a local
   Supabase → `pnpm dev` → send an SMS to a configured Twilio number →
   see the prospect's message and the AI reply appear in the dashboard
   under `/conversations/[id]` with live updates.
4. The verification checklist in §8.5 passes.
5. All five open items in §10 are resolved with the pilot property.
