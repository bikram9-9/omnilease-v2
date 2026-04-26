# OmniLease vs EliseAI Product Gap

Date: April 25, 2026

## Purpose

This document answers three questions:

1. What OmniLease has today.
2. What EliseAI publicly offers for property management.
3. What product gap remains if the goal is to build an end-to-end EliseAI-like product, and which parts can be mitigated first.

The practical recommendation is not to copy the whole EliseAI suite at once. EliseAI is now a broad property-management operating platform. OmniLease should first match the narrow wedge that wins pilots: always-on leasing conversations, lead capture, tour booking, human takeover, and lightweight reporting. Resident operations, voice, PMS depth, and guided tours come after the leasing wedge is reliable.

## Current OmniLease Feature Inventory

Evidence comes from the current repo state, especially `README.md`, `new-omnilease-spec.md`, `apps/web`, `packages/db`, and the Drizzle schema.

### Shipped Or Mostly Implemented

| Area | Current capability | Evidence |
| --- | --- | --- |
| Multi-tenant app foundation | Next.js dashboard with Supabase auth, organization-scoped users, roles, onboarding, and dashboard shell. | `README.md`, `apps/web/src/app/sign-in`, `apps/web/src/app/onboarding`, `packages/db/src/schema/tenancy.ts` |
| Property management | CRUD for properties with name, address, timezone, slug, brand color, escalation email, welcome message, website widget ID, and Messenger page ID. | `apps/web/src/app/(dashboard)/properties/actions.ts`, `packages/db/src/schema/properties.ts` |
| Unit/floorplan management | CRUD for unit types, beds, baths, sqft range, price range, availability count, deposit, description, active state. | `apps/web/src/app/(dashboard)/properties/[id]/units/actions.ts`, `packages/db/src/schema/properties.ts` |
| Property knowledge | Markdown context loaded from `content/properties/<slug>/` for overview, amenities, policies, FAQs, and touring. | `apps/web/src/lib/property-context.ts` |
| Website chat widget | Embeddable vanilla JS widget with launcher, branded panel, localStorage session persistence, session API, chat API, and streaming assistant replies. | `apps/web/public/widget.js`, `apps/web/src/app/api/widget/session/route.ts`, `apps/web/src/app/api/widget/chat/route.ts` |
| Conversation engine | Shared engine using AI Gateway model routing, property context, unit inventory, recent history, intent classification, tools, safety filtering, and message persistence. | `apps/web/src/lib/conversation/engine.ts`, `system-prompt.ts`, `intent.ts`, `safety.ts` |
| AI tools | Tools for collecting prospect info, checking availability, and escalating to a human. | `apps/web/src/lib/conversation/tools.ts` |
| Conversation storage | Tables for conversations, messages, escalations, channels, lead fields, statuses, tool calls, confidence score, and metadata. | `packages/db/src/schema/conversations.ts` |
| Inbox/read view | Dashboard conversation list and detail view with status, channel, property, message history, prospect details, and escalation rows. | `apps/web/src/app/(dashboard)/conversations/page.tsx`, `apps/web/src/app/(dashboard)/conversations/[id]/page.tsx` |
| Basic analytics | Overview counts for properties, conversations, and open escalations. | `apps/web/src/app/(dashboard)/dashboard/page.tsx` |
| Safety and escalation | Prompt-level fair housing guardrails, safety filter, AI tool escalation, escalation rows, and email escalation plumbing. | `system-prompt.ts`, `safety.ts`, `escalate.ts`, `apps/web/src/lib/email/resend.ts` |

### Planned Or Partially Represented

| Area | Current state |
| --- | --- |
| Facebook Messenger | Schema has `messengerPageId` and conversation channel supports `messenger`, but webhook ingestion and outbound reply are not implemented. |
| SMS / phone | Historical specs include SMS and phone ambitions, but current README says active Twilio/TCPA runtime was removed from the product direction. Conversation channel includes `phone`, but no live Twilio routes exist in the current app tree. |
| Human takeover | The inbox can display messages and escalation details, but there is no visible agent reply composer or takeover state machine in the current route files. |
| Tour scheduling | Prompt encourages tour movement and Markdown can contain touring info, but there is no calendar availability, booking, reschedule, confirmation, or reminder workflow. |
| Lead lifecycle | Lead fields are captured on the conversation row, but there is no dedicated lead object, pipeline stage, duplicate handling, quote/application workflow, or CRM export. |
| Reporting | Only simple counts are implemented. No funnel, source, conversion, response-time, automation-rate, or property/portfolio reporting yet. |
| Integrations | No PMS/CRM/calendar integrations are implemented. |
| Resident operations | Maintenance, renewals, delinquency, payments, move-in, resident concierge, and maintenance app workflows are not implemented. |
| Compliance operations | Fair housing prompt guardrails exist. TCPA opt-out, consent, quiet hours, data retention, audit exports, and compliance reporting are not present in the current schema. |

## EliseAI Public Product Surface

EliseAI is not just a leasing chatbot. Public docs and product pages position it as an AI operating platform for multifamily, student, affordable, single-family housing, and healthcare.

### Platform And CRM

EliseAI’s platform page describes EliseCRM as a unified hub that centralizes tours, scheduling, maintenance, renewals, delinquency, reporting, contacts, conversations, and workflows across a portfolio. It also claims omnichannel automation across SMS/text, email, chat, and voice, with a single conversational memory so renters do not repeat themselves.

Sources:

- https://eliseai.com/platform-overview
- https://eliseai.com/ad-demo-multifamily-leasing-ai

### LeasingAI

Public support docs say LeasingAI engages leads, books tours, boosts conversions, and measures performance in one system. It includes:

- CRM/PMS integrations with systems such as Anyone Home, Funnel, Knock, Yardi RentCafe, AppFolio, RealPage OneSite, Rent Manager, Yardi Voyager, Entrata, and ResMan depending on product support.
- Onboarding with community selection, launch planning, integration setup, EIN submission for AI outreach, calendar setup, knowledge setup, training, allowlist testing, and go-live.
- Leasing knowledge that can be prefilled from property websites.
- Calendar and tour settings, including agent-level Outlook/Google calendar sync.
- AI assistant goals, screening criteria, personality settings, and cross-selling across communities.
- Central Agent for centralized leasing offices, where one prospect’s inquiries across multiple properties can be managed in one thread.
- Proactive leasing outreach and follow-ups.
- Leasing reporting dashboards, data share, and reporting API.
- Affordable, student, single-family, lease-up, HOA, duplicate guest card, fee transparency, and quote support.

Source:

- https://support.meetelise.com/hc/en-us/articles/42925263474061-Getting-Started-with-LeasingAI

### AI-Guided Tours

EliseAI’s AI-guided tour docs describe an automated self-guided tour flow:

- Prospect schedules through ILS, chat, SMS, email, or voice.
- EliseAI verifies ID and can collect credit card information.
- On arrival, it sends temporary PIN codes for lockboxes or smart locks.
- During the tour, it provides a community map and answers using PMS, CRM, and knowledge-base data.
- Near the end, it asks for feedback, sends application links, and reminds the prospect to return keys/fobs.
- After the tour, it handles follow-ups.
- Setup includes a completion checklist.

Source:

- https://support.meetelise.com/hc/en-us/articles/42445571953037-AI-Guided-Tours-Overview

### VoiceAI

EliseAI’s VoiceAI docs describe conversational voice for leasing and resident calls:

- Handles most leasing and resident calls with natural language.
- Can be configured to answer first ring or overflow calls.
- Uses PMS, CRM, and knowledge-base data.
- Leasing voice guides prospects through the funnel.
- Resident voice handles maintenance, renewals, and delinquency questions.
- Hands off to a designated team or user when needed.
- Supports 33 spoken languages.
- Includes an integrated call center in the EliseAI portal.
- Bundled with ResidentAI products and available as an add-on for LeasingAI.

Source:

- https://support.meetelise.com/hc/en-us/articles/31452318626061-Getting-Started-with-VoiceAI

### ResidentAI, Maintenance, Renewals, Delinquency

EliseAI’s platform and support docs describe resident-side automation:

- Maintenance request triage, categorization, routing, status updates, and escalation.
- Maintenance App for mobile work orders and assignments.
- Renewal outreach, resident questions, renewal offers, and scheduled notifications.
- Delinquency reminders, questions about payments and late fees, payment plans, promises to pay, collections handoff, and proactive outreach.
- Resident check-ins and general assistance.

Sources:

- https://eliseai.com/platform-overview
- https://support.meetelise.com/hc/en-us/articles/38935696398093-EliseAI-Outreach-to-Prospects-and-Residents
- https://support.meetelise.com/hc/en-us/articles/35484387469965-Delinquency-Support-in-RenewalsAI

### Fee Transparency, Lease Audits, Affordable Housing

EliseAI publicly lists fee transparency and lease audits as platform products. Its LeasingAI docs also say fee data can come from Yardi, Entrata, Engrain, or EliseAI’s fees page, and that the assistant can share total monthly leasing price in states where required. Its platform FAQ says affordable portfolios can screen, qualify, schedule, manage documents, support voucher compliance, and automate recertification workflows.

Sources:

- https://eliseai.com/platform-overview
- https://support.meetelise.com/hc/en-us/articles/42925263474061-Getting-Started-with-LeasingAI

## Gap Matrix

| Product area | EliseAI | OmniLease today | Gap | Mitigation |
| --- | --- | --- | --- | --- |
| Web chat | Web chat as one channel in omnichannel assistant. | Implemented: embeddable widget, session API, streaming chat. | Need production hardening, source attribution, transcript continuity, styling controls, and lead forms/tool-driven capture polish. | Finish widget reliability, admin install instructions, test harness, and conversion tracking. |
| SMS/text | Supports SMS/text conversations and proactive outreach. | Not live in current product direction; no Twilio webhook in app tree. | Major channel gap for leasing teams. | Add inbound/outbound SMS via Twilio, opt-out, consent logs, quiet hours, and channel-normalized conversation routing. |
| Email | Manages property inboxes and follow-ups. | Not implemented. | Major omnichannel gap. | Add SendGrid/Mailgun inbound parse and outbound email after SMS/Messenger foundations. |
| Messenger | Public EliseAI focuses text/email/chat/voice; OmniLease also targets Messenger. | Schema-ready, not live. | Useful channel gap for Facebook-heavy properties. | Implement webhook verification, inbound normalization, page-token outbound replies, and channel tests. |
| Voice | VoiceAI answers leasing/resident calls, supports handoff, call center, 33 spoken languages. | Not implemented. | Large gap, but expensive and complex. | Defer until text channels and tour booking work. Start later with Twilio Voice + streaming STT/TTS + call summaries. |
| Leasing Q&A | Answers property questions with PMS/CRM/KB data. | Implemented for Markdown KB plus unit-type data. | Missing PMS real-time sync, source confidence, knowledge editing UI, and automated prefill. | Add knowledge editor/importer, structured policy fields, confidence/source tracing, and eventual PMS sync. |
| Lead capture | Captures and nurtures prospects across channels. | Tool saves name, email, phone, move-in date, unit preference on conversation row. | No lead object, pipeline, dedupe, application link, quote, or CRM export. | Create `leads` table, lifecycle states, dedupe, source tracking, lead summary, and CSV/webhook export. |
| Tour scheduling | Books/reschedules/cancels in-person, virtual, self-guided tours; syncs calendars. | Not implemented. | Critical gap for leasing conversion. | Build Calendar/Calendly MVP: availability, slot offer, booking, confirmation, reschedule/cancel, reminders. |
| AI-guided tours | ID verification, temporary lock codes, map, in-tour assistant, feedback, application link, post-tour follow-up. | Not implemented. | Big differentiator gap, but not required for first leasing MVP. | Defer. Start with regular tour scheduling, then self-guided tour checklist and smart-lock integrations. |
| Human takeover | Live handoff to team/user, call center for voice. | Escalation rows and inbox display exist; no agent composer/takeover flow visible. | Critical operations gap. | Add reply composer, assignment, takeover/return-to-AI state, internal notes, SLA status, notifications. |
| Proactive outreach/follow-up | Core suite capability for leasing, resident, maintenance, delinquency, renewals. | Not implemented. | Critical for conversion and resident workflows. | Add event-driven sequences: lead no reply, tour booked, post-tour, application nudge; later resident sequences. |
| Reporting | Lead count, engagement, conversion, product dashboards, data share/API. | Basic count cards only. | Big management gap. | Add leasing funnel dashboard first: response time, lead capture, tour booking, escalations, conversion proxy, source/channel. |
| PMS/CRM integrations | Broad integrations with Yardi, Entrata, AppFolio, RealPage, Knock, Funnel, etc. | None. | Enterprise-scale gap. | Use import/export and webhooks first. Pick one PMS/CRM for phase 3, likely Entrata/AppFolio/Yardi depending on pilot. |
| Resident maintenance | Triage, categorize, route, update status, maintenance app. | Not implemented. | Separate product-line gap. | Defer until leasing wedge works. Later add resident identity, work orders, categories, priority, vendor/team routing. |
| Renewals | Renewal outreach, offers, questions, scheduled notifications. | Not implemented. | Separate product-line gap. | Defer. Requires resident ledger/lease data integration. |
| Delinquency | Payment reminders, late fee questions, payment plans, promises to pay, collections handoff. | Not implemented. | Separate product-line gap with compliance risk. | Defer. Requires ledger/payment integration and strict compliance review. |
| Fee transparency | Fee data ingestion and total monthly leasing price disclosure. | Unit pricing/deposit only. | Important for compliance and trust. | Add structured fees table and prompt/tool support before paid pilots in fee-regulated states. |
| Affordable housing | Screening, qualification, voucher compliance, document and recertification workflows. | Not implemented. | Specialized vertical gap. | Defer unless pilot requires it. Build as separate configuration pack. |
| Centralized operations | Portfolio-level CRM, centralized leasing offices, cross-property conversation management. | Multi-property dashboard exists but light. | Moderate to large gap. | Add portfolio inbox filters, cross-property availability, role/assignment model, and centralized lead search. |

## What We Can Mitigate Fastest

### 1. Become Great At Leasing Webchat Plus Inbox

This is the strongest current base. The widget, conversation engine, knowledge loading, unit availability tool, and inbox already exist. The next step should make this usable by a real property manager every day:

- Add agent reply composer and human takeover.
- Add assignment, internal notes, status transitions, and close/convert actions.
- Add install instructions and widget preview per property.
- Add source/channel tracking and basic conversation search.
- Add knowledge editor or structured forms so non-technical users do not edit Markdown manually.

### 2. Add Tour Scheduling Before More Channels

Tour scheduling is the highest-value EliseAI leasing gap. It directly turns conversations into revenue outcomes.

Minimum viable version:

- Property-level tour settings: tour types, duration, buffer, office/tour hours, blackout dates.
- Calendar provider: Google Calendar or Calendly first.
- AI tools: `get_tour_slots`, `book_tour`, `reschedule_tour`, `cancel_tour`.
- Confirmation messages and email/SMS reminders.
- Dashboard tour list attached to conversations and leads.

### 3. Normalize Leads And Follow-Ups

The current conversation row stores prospect fields, which is fine for a prototype but weak for CRM-like workflows.

Needed:

- `leads` table with property, source, channel, contact details, preferences, stage, consent, last touch, owner, and duplicate keys.
- Conversation-to-lead linking.
- Follow-up sequences for no response, tour not scheduled, tour booked, tour completed, and application not started.
- Opt-out and suppression handling before proactive SMS/email.

### 4. Add SMS After Compliance Primitives

SMS is table stakes for EliseAI parity, but it should not be bolted on without TCPA basics.

Needed:

- Twilio inbound webhook, signature verification, status callbacks, outbound sending.
- `sms_opt_outs`, `consent_records`, quiet hours, sender disclosure, STOP handling.
- Shared channel-normalized ingestion so website, Messenger, SMS, and email all create the same conversation/message objects.

### 5. Reporting That Proves ROI

EliseAI sells operational ROI. OmniLease needs a small dashboard that proves missed-lead mitigation and conversion lift:

- Response time.
- Total conversations by channel/property.
- Lead capture rate.
- Tour booking rate.
- Escalation rate and reasons.
- Human takeover volume.
- Top unanswered questions.
- Estimated saved staff time.

## Build Sequence To Reach EliseAI-Like Leasing Parity

### Phase A: Production Leasing Assistant

Goal: one property can run webchat reliably.

- Harden widget session reuse and transcript rendering.
- Add agent takeover and replies.
- Add knowledge editing/import.
- Add lead model and lead profile page.
- Add basic reporting.
- Add E2E tests for widget chat, escalation, and inbox review.

### Phase B: Tour Conversion

Goal: assistant can turn qualified prospects into booked tours.

- Add tour settings and calendar integration.
- Add booking/reschedule/cancel tools.
- Add reminders and post-tour follow-up.
- Add tour dashboard and reporting.

### Phase C: Omnichannel Leasing

Goal: match EliseAI’s core leasing channels except voice.

- Implement Messenger.
- Implement SMS with TCPA controls.
- Implement inbound/outbound email.
- Unify all channels through one ingestion and reply pipeline.
- Add proactive lead follow-up sequences.

### Phase D: CRM And Integrations

Goal: become a lightweight EliseCRM alternative for small/mid-market operators.

- Add dedupe, lead search, pipeline stages, lost reasons, application links, quote support, and export/webhooks.
- Add one pilot-driven PMS/CRM integration.
- Add portfolio-level reporting and centralized inbox workflows.

### Phase E: Voice And Resident Operations

Goal: expand beyond leasing into the broader EliseAI suite.

- Add VoiceAI-like phone answering with handoff and call summaries.
- Add maintenance intake and routing.
- Add renewals and delinquency only after resident identity, lease, ledger, and compliance foundations exist.
- Add self-guided/AI-guided tours after basic tour scheduling is working.

## The Real Product Gap

OmniLease has a credible start on the core AI answering engine and website chat channel. The biggest gap is not the LLM. The gap is operational workflow: booking tours, tracking leads, letting humans take over, following up proactively, reporting ROI, and integrating with property systems.

To get close to EliseAI end-to-end, the product needs:

1. A real leasing CRM layer, not just conversations.
2. Tour scheduling and follow-up automation.
3. Channel normalization across website, Messenger, SMS, and email.
4. Human takeover and team operations.
5. Compliance primitives for proactive messaging.
6. PMS/CRM/calendar integrations.
7. Resident-side workflows only after leasing is stable.

## Immediate Next Step

Build the missing operator workflow around the current webchat engine:

1. Agent reply composer and takeover.
2. Lead table and lead profile.
3. Tour scheduling MVP.
4. Follow-up sequence engine.
5. Leasing analytics dashboard.

That sequence gets OmniLease closest to the part of EliseAI that buyers immediately understand and pay for: converting inbound renter interest into tours and applications while reducing leasing-team workload.

## Double Review Addendum

Date: April 25, 2026

This addendum tightens the roadmap into release gates, skip/defer decisions, missing EliseAI parity areas, and the testing/LLM quality plan.

### Assumption

The phrase "LECI" is treated here as EliseAI / LeasingAI, based on the prior competitor-review context.

### What Can Be Skipped For The First Release

The first production release should not try to be full EliseAI. It should be a controlled leasing pilot that proves OmniLease can safely handle inbound renter conversations and convert them into human-reviewed leads.

Skip or defer until after the first production pilot:

- VoiceAI / phone answering.
- Resident maintenance workflows.
- Renewals and delinquency automation.
- Self-guided / AI-guided tours with ID verification and smart-lock access.
- Deep PMS integrations beyond CSV/webhook export or one pilot-driven connector.
- Portfolio analytics and centralized leasing operations.
- Affordable housing, student housing, single-family, HOA, and lease-up specialty workflows.
- Lease audits and fee-transparency automation, unless the pilot property legally requires it.
- Full document ingestion and property website scraping. Use manual property context editing first.
- Email channel if the first pilot is website chat plus human handoff only.
- SMS if TCPA consent, opt-out, quiet-hours, and suppression controls are not ready.

Do not skip for the first production pilot:

- Human takeover and reply composer.
- Lead creation/profile from captured prospect data.
- Widget install/preview and session/transcript reliability.
- Escalation visibility and operator workflow.
- Baseline analytics.
- Unit, integration, and browser smoke tests.
- LLM prompt/tool regression tests.
- Basic release/runbook/rollback checklist.

### Missing EliseAI Surface Not Yet Explicit Enough

The roadmap now covers the main leasing wedge, but these EliseAI-like areas still need explicit product decisions before being built:

- Fee transparency and total monthly price disclosure.
- Lease audits.
- AI assistant personality, goals, screening criteria, and community-specific behavior settings.
- Agent-level calendar configuration, not just property-level availability.
- Centralized leasing office workflows and cross-property memory.
- Data-share/reporting API depth comparable to EliseAI reporting/data share.
- Launch/onboarding checklist: knowledge training, allowlist testing, go-live validation, and operations handoff.
- Vertical packs: affordable, student, single-family, HOA, lease-up.
- Guided-tour operations: ID verification, temporary access codes, maps, in-tour help, feedback, and key/fob return workflow.

The right move is to track these as deferred parity decisions, not to pull them into Phase A.

### Release Gates

#### Current State: Pre-Production Alpha

The app can build and test locally, and the codebase has real foundations:

- Website widget session/chat APIs.
- Conversation engine using property Markdown context plus unit data.
- Prompt guardrails and tool calling.
- Conversation inbox/read view.
- Escalation rows and email plumbing.
- Unit/property management.

It is not yet safe as an unattended production leasing product because human takeover, lead objects, production-ready widget install flow, and release-grade test/eval gates are missing.

#### Release 0: Internal Staging

Can happen now after environment verification.

Purpose:

- Dogfood the dashboard and widget.
- Exercise the AI assistant with seeded property content.
- Run fresh tests and browser smoke checks on every change.

Required before internal staging:

- Fresh `pnpm test --force`, `pnpm typecheck --force`, `pnpm lint`, and `pnpm build`.
- Seeded test property with realistic policies, amenities, FAQs, touring, and unit inventory.
- Manual red-team script for fair housing, hallucination, escalation, pricing, pets, fees, and availability questions.

#### Release 1: Controlled Production Pilot

Ship after the Phase A minimum gate.

Required Phase A minimum:

- Widget install/preview and transcript/session reliability.
- Inbox reply composer and human takeover.
- Lead model and lead profile linked to conversations.
- Baseline analytics and operational logging.
- Fresh unit/integration/browser smoke suite in CI.
- LLM eval harness with golden conversations.
- Runbook: deploy, rollback, escalation delivery, AI outage, DB outage, and widget outage.

This release can be website chat only. Tour scheduling, SMS, email, voice, resident ops, PMS, and guided tours can all wait.

#### Release 2: Paid Leasing Pilot

Ship after Phase B.

Required:

- Tour settings and calendar/provider availability.
- AI booking/reschedule/cancel tools.
- Confirmations, reminders, and post-tour follow-ups.
- Tour dashboard and reporting.
- End-to-end tests from website chat to lead to booked tour to dashboard.

This is the first release that can credibly claim "AI leasing assistant" instead of "AI answering and lead capture."

#### Release 3: Omnichannel Leasing

Ship after Phase C.

Required:

- Shared normalized channel pipeline.
- Messenger.
- SMS with TCPA controls.
- Email if needed by pilot customers.
- Proactive follow-up sequences.

#### Release 4: CRM / Integration Expansion

Ship after Phase D.

Required:

- Lead pipeline, search, dedupe, assignment, export/webhooks.
- One pilot-driven PMS/CRM integration.
- Portfolio inbox/reporting only if there is a multi-property customer.

#### Release 5: EliseAI Suite Expansion

Ship after Phase E.

Required:

- Voice.
- Maintenance.
- Renewals.
- Delinquency.
- Guided tours.
- Vertical packs and deeper compliance.

### LLM State And Gaps

Current LLM state:

- The engine uses Vercel AI Gateway with `anthropic/claude-sonnet-4.6` in `apps/web/src/lib/conversation/engine.ts`.
- The model is hard-coded rather than centrally configured per environment, customer, or experiment.
- The prompt builder is tested, including fair-housing guidance and property/unit context rendering.
- Integration tests mock the AI SDK call while keeping DB, safety, tools, and escalation behavior real.
- There is no live LLM eval harness yet.
- There is no golden conversation dataset yet.
- There is no model canary, fallback, latency/cost telemetry, or prompt-version tracking yet.

LLM work needed before controlled production:

- Central model config with environment-specific model choice and fallback.
- Prompt versioning and regression tests.
- Golden conversation suite covering common leasing flows and edge cases.
- Red-team scenarios for fair housing, protected classes, legal questions, complaints, accommodations, hallucination, pricing/availability uncertainty, and human handoff.
- Tool-call evals for `collect_prospect_info`, `check_availability`, `escalate_to_human`, and future tour tools.
- Tracing for prompt version, model, latency, token usage, tool calls, safety result, confidence, and escalation reason.
- Manual review queue for low-confidence or safety-sensitive outputs during pilot.

### Testing State And Required Testing Spine

Current verification run on April 25, 2026:

- `pnpm test`: passed via Turbo cache replay.
- `pnpm typecheck`: passed via Turbo cache replay.
- `pnpm lint`: passed.
- `pnpm build`: passed.

Current tests cover:

- DB schema shape.
- Validators.
- Conversation intent classification.
- Safety filtering.
- System prompt rendering.
- Email escalation send behavior.
- Widget chat route integration.
- Conversation engine integration with mocked AI output and real DB/escalation side effects.

Important gaps:

- No fresh forced full test run was performed in this addendum.
- No browser E2E test validates a real widget session in a running app.
- No CI gate is documented here.
- No live LLM quality eval exists.
- No test coverage thresholds are enforced.
- No mutation/negative tests for compliance-sensitive workflows.

Testing standard for every phase:

- Every data model change gets schema tests and migration assertions.
- Every server action/API route gets success, validation failure, auth failure, and ownership tests.
- Every AI tool gets unit tests for valid calls, invalid calls, permission/ownership boundaries, and idempotency.
- Every user workflow gets at least one browser smoke test.
- Every outbound side effect gets idempotency tests and provider-failure tests.
- Every LLM-facing prompt/tool change updates golden conversation evals.
- Every compliance-sensitive workflow gets red-team cases.

Release test gates:

- Unit/integration tests pass fresh, not only from cache.
- Typecheck, lint, and production build pass.
- Browser smoke test passes for sign-in/onboarding, property setup, widget chat, inbox review, human takeover, and lead profile.
- LLM golden eval pass rate meets the agreed threshold before each release.
- No known P0/P1 security, auth, ownership, or compliance bugs remain open.

## EliseAI Parity Recheck

Date: April 25, 2026

This recheck treats EliseAI as the explicit one-to-one target, with phased delivery so OmniLease can still get into production quickly.

Sources reviewed:

- https://eliseai.com/platform-overview
- https://eliseai.com/prospect-management
- https://eliseai.com/elisecrm
- https://eliseai.com/integrations
- https://eliseai.com/fee-transparency
- https://eliseai.com/lease-audits
- https://support.meetelise.com/hc/en-us/articles/42925263474061-Getting-Started-with-LeasingAI
- https://support.meetelise.com/hc/en-us/articles/42445571953037-AI-Guided-Tours-Overview
- https://support.meetelise.com/hc/en-us/articles/31452318626061-Getting-Started-with-VoiceAI

### Verdict

The current roadmap is directionally good and correctly prioritizes the leasing wedge before resident operations. It does not yet look like a full EliseAI clone unless a few missing product surfaces become first-class backlog items.

The highest-risk planning gaps are:

1. AI assistant configuration is not explicit enough.
2. Fee transparency and quote/application support are too late if the goal is a credible paid leasing pilot.
3. Tour scheduling needs agent-level ownership, not only property-level availability.
4. EliseCRM-style guest cards, duplicate handling, calendar/task routing, and campaign tools need clearer Phase D stories.
5. The roadmap should distinguish "launchable production pilot" from "EliseAI parity."

### What OmniLease Already Has That Looks Good

OmniLease has a credible technical base for the first EliseAI wedge:

- Website widget.
- Conversation session API and streaming chat API.
- Property/unit management.
- Markdown property knowledge.
- Shared conversation engine.
- Lead field capture on conversations.
- Safety guardrails and escalation tool.
- Dashboard conversation list/detail.
- Escalation email plumbing.
- Tests for schema, validators, intent, safety, prompt rendering, email sending, widget chat route, and conversation-engine side effects.

This is enough for an internal staging release, but not enough for an unattended production leasing release.

### Critical EliseAI Surfaces That Must Be Represented In The Plan

EliseAI's current public product is broader than chatbot parity:

- Prospect management: answer leads, recommend units, screen renters, schedule tours, automate follow-ups, and keep one prospect conversation across webchat, email, text, voice, and multiple communities.
- EliseCRM: centralized guest card, centralized calendar, team task routing, AI personalization, quote generation, campaigns, mass messaging, robust reporting, enhanced knowledge, sentiment analysis, and automatic conversation tracking.
- LeasingAI settings: goals, screening criteria, personality, cross-selling, Central Agent, proactive outreach, CRM-specific workflows, reporting, data share, and reporting API.
- AI-Guided Tours: scheduling from ILS/chat/SMS/email/voice, ID verification, optional card collection, temporary access codes, community map, in-tour Q&A, application link, key/fob reminders, feedback, and post-tour follow-up.
- VoiceAI: leasing and resident calls, first-ring or overflow answering, PMS/CRM/knowledge data, handoff, call center, spam/robocall filtering, multilingual voice, and reporting.
- Fee Transparency: centralized fees, jurisdiction-aware disclosures, dynamic chat/widget/website/PDF fee display.
- Lease Audits: compare leases to ledgers, flag missing fees/signatures/billing errors, review/dismiss workflow, and continuous audit mode.
- Integrations: PMS, CRM, ILS, touring, access-control, smart-lock, mapping, and data-share ecosystem.

### Planning Corrections

These are the corrections to make the phases feel like "EliseAI in sequence" instead of generic SaaS work.

#### Phase A: Production Leasing Assistant

Keep Phase A webchat-only if needed, but it must include operator control:

- Widget install, preview, continuity, and error states.
- Inbox reply composer and human takeover.
- Lead model and lead profile.
- Knowledge editor/import.
- Launch checklist and allowlist testing.
- LLM eval harness and golden conversations.
- AI assistant settings: personality, goals, screening questions, selling points, escalation rules, and fair-housing guardrails.
- Baseline analytics and runbooks.

Release decision: this is the first controlled production pilot, not a paid "EliseAI parity" release.

#### Phase B: Tour Conversion And Quote/Fee MVP

Phase B should be the first release that feels commercially compelling:

- Tour settings.
- Agent-level calendar routing.
- Booking, rescheduling, and cancellation tools.
- Confirmations, reminders, and post-tour follow-ups.
- Tour dashboard/reporting.
- Application link workflow.
- Quote MVP with rent, specials, deposits, recurring fees, one-time fees, disclaimers, and estimated monthly total.

Release decision: this is the first paid leasing pilot.

#### Phase C: Omnichannel Leasing And Outreach

Phase C should match EliseAI's core channel promise except voice:

- Messenger.
- SMS with consent, opt-out, quiet hours, and suppression.
- Email inbound/outbound.
- One normalized channel pipeline.
- Proactive outreach/follow-up cadences.
- One prospect, one conversation across channel switches.

Release decision: this is the first "core LeasingAI competitor" release.

#### Phase D: EliseCRM Core

Phase D should become the operational hub:

- Centralized guest card.
- Duplicate detection and merge workflow.
- Lead pipeline, owner, stage, lost reason, and search.
- Centralized calendar and task routing.
- Campaigns and mass messaging with segments.
- Sentiment/needs-reply detection.
- Portfolio inbox and cross-property memory.
- Cross-selling across properties.
- Export/webhooks and one pilot-driven PMS/CRM integration.
- Reporting API or data share.

Release decision: this is the first "lightweight EliseCRM alternative" release.

#### Phase E: VoiceAI And Guided Tour Expansion

Phase E should add the hard operational edges:

- VoiceAI-style call answering.
- Call summaries and call-center queue.
- Handoff and spam/robocall filtering.
- AI-guided/self-guided tour setup checklist.
- ID verification and optional card collection.
- Access-code/smart-lock integration.
- In-tour map/help, feedback, application link, key/fob return, and post-tour follow-up.

Release decision: this is the first "advanced automation" release.

#### Phase F: ResidentAI And Enterprise Compliance

If the goal is true suite parity, this should not be hidden inside one oversized later phase:

- Maintenance intake, triage, routing, status updates, and mobile work-order foundation.
- Renewals outreach, offers, resident questions, and negotiation handoff.
- Delinquency reminders, late-fee questions, payment-plan intent, promise-to-pay, and collections handoff.
- Fee Transparency full suite.
- Lease Audits.
- Affordable, student, single-family, HOA, and lease-up vertical packs.

Release decision: this is suite expansion, not needed for first leasing revenue.

### What Can Still Be Skipped For Speed

To get out quickly, skip these until after Phase B unless a pilot explicitly requires them:

- Voice.
- Resident operations.
- AI-guided/self-guided tours with access control.
- Deep PMS sync.
- Lease audits.
- Full Fee Transparency Suite.
- Affordable/student/single-family vertical packs.
- Mass campaigns.
- Data share/Snowflake-style reporting.

Do not skip:

- Human takeover.
- Lead profile.
- Knowledge editing.
- AI assistant settings.
- Unit availability/fee correctness.
- Tour scheduling.
- Quote/application link MVP.
- LLM evals.
- Strong unit/integration/browser testing.

### Next Backlog Additions

Add these missing stories:

1. Phase A: AI assistant configuration for goals, personality, screening, selling points, and escalation rules.
2. Phase B: Agent-level calendar routing and tour ownership.
3. Phase B: Quote, application link, and fee disclosure MVP.
4. Phase D: Centralized guest card, duplicate handling, and CRM/PMS guest-card sync.
5. Phase D: Campaigns, mass messaging, segmentation, and send logging.
6. Phase D: Sentiment, needs-reply detection, and team task routing.
7. Phase F or late Phase E: split ResidentAI/enterprise compliance from the broad voice/resident epic if the roadmap needs exact suite parity.

### Final Planning Recommendation

The current product can look good against EliseAI only if we position Phase A honestly:

- Phase A is not EliseAI parity.
- Phase A is a production-safe web leasing assistant.
- Phase B is the first sellable leasing conversion product.
- Phase C is the first real LeasingAI competitor.
- Phase D is the first EliseCRM competitor.
- Phase E/F are full-suite parity.

This is the fastest route that does not lie to the product plan.
