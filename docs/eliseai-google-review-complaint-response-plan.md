# EliseAI Google Review Complaint Response Plan

Date: April 25, 2026

## Purpose

This document converts public one-star Google Maps reviews for EliseAI into first-release OmniLease requirements. The goal is not to copy competitor features. The goal is to avoid the trust failures that reviewers repeatedly describe: hard-to-reach humans, unsafe emergency handling, double-booked tours, unclear AI disclosure, poor integrations, and operators losing control of resident/prospect workflows.

Source reviewed: Google Maps business profile for EliseAI at `33 E 33rd St, New York, NY 10016`. At review time Google Maps showed `2.5` stars, `52` reviews, and `32` one-star reviews.

## Non-Negotiable Release Principles

1. OmniLease must clearly disclose when a prospect or resident is speaking with AI.
2. OmniLease must always provide a path to a human for urgent, emergency, complaint, legal, privacy, payment, application-blocking, and confused-user scenarios.
3. OmniLease must not let AI become the only operational path for time-sensitive resident or leasing issues.
4. OmniLease must not book, reschedule, cancel, or message unless the property has explicitly enabled and tested that workflow.
5. OmniLease must show operators what the AI did, why it did it, and what still needs human review.
6. OmniLease must fail closed for unsupported workflows: route to a human instead of improvising.

## Complaint Inventory

| # | Reviewer | Date | Complaint theme | First-release requirement |
| --- | --- | --- | --- | --- |
| 1 | Aidan Gagner | 2 months ago | AI used by apartment complex without clear disclosure; loss of human service. | AI identity disclosure, human escalation, operator launch checklist. |
| 2 | Stephen Wade | 6 months ago | Emergency reporting did not reach a human; personal data concerns. | Emergency handoff, privacy disclosure, consent/audit trail. |
| 3 | Johan Sweldens | 4 months ago | Rental application blocked; no help phone number. | Application-blocking handoff, application status escalation, fallback contact. |
| 4 | DemascoNY | 8 months ago | Billing/payment issue routed into ineffective AI loop. | Payment/billing issues are out-of-scope and must route to human. |
| 5 | Simon Kaluza | 9 months ago | Emergency maintenance call had no human escalation path. | Emergency detection, immediate human route, no AI-only emergency path. |
| 6 | Lucas Morales | 4 months ago | Repetitive questions and double-booked tours. | Conversation memory, booking idempotency, calendar conflict checks. |
| 7 | Jave JAve | 10 months ago | Healthcare scheduling/integration promises not met. | Integration readiness checks, vertical scope boundaries, provider health status. |
| 8 | Mike F. | Edited 11 months ago | Slow CRM processing, missed notifications, unauthorized rollout, healthcare-risk concern. | Operator QA gate, notification delivery monitoring, performance SLO, rollout approval. |
| 9 | Jay | a year ago | Could not reach apartment staff because AI would not transfer. | Human handoff command and visible escalation SLA. |
| 10 | Chris Connway | 9 months ago | Resident communication bot could not resolve or escalate issues. | Resident complaints route to human; inbox assignment and response workflow. |
| 11 | Kenneth Stone | 2 years ago | Calendar/tour sync gaps, nuanced questions, incomplete lead capture, floorplan confusion. | Calendar sync, agent routing, required lead fields, floorplan/source confidence. |
| 12 | Max Myron | 7 months ago | Could not reach a human or verify AI-provided info. | Human transfer, answer source/confidence, “I am not sure” fallback. |
| 13 | Dylan Hancock | 8 months ago | Urgent/human requests got repeated questions. | Intent detector must prioritize urgency/human request over qualification. |
| 14 | Sharon Ourian | 5 months ago | System sounded good in theory but did not follow up. | Follow-up reliability, operator-visible pending work queue. |
| 15 | P. G. | a year ago | AI made contacting leasing office harder. | Human contact fallback and no replacement of existing contact paths. |
| 16 | Sam Chenoweth | 6 months ago | Repeated unwanted texts. | SMS opt-out, rate limits, consent status, quiet hours. |
| 17 | Jeana Crowley | a year ago | Double booking and no confirmation with actual company. | Booking conflict checks, confirmation, agent/property calendar ownership. |
| 18 | Larami Oliver | a year ago | Oversold product did not deliver promised outcome. | Launch readiness scorecard, scoped rollout, success criteria. |
| 19 | Max Scheffman | 2 weeks ago | Older residents may think they are talking to a human. | AI disclosure in every channel, accessible language. |
| 20 | M Itou | 3 weeks ago | General annoyance. | Reduce repetitive/unsolicited messaging; easy stop/human options. |
| 21 | dug moore | a month ago | Appointments created without operator awareness; odd harassment-like behavior. | Operator approval/visibility, activity log, messaging throttles. |
| 22 | AJ Freno | a month ago | Apartment complex switched to bot; wants human interaction back. | Human handoff, property-configurable AI role, launch messaging. |
| 23 | Jack Grotjohn | 4 days ago | Rating only. | Count toward negative sentiment; no specific requirement. |
| 24 | Krishna Pandya | a week ago | Rating only. | Count toward negative sentiment; no specific requirement. |
| 25 | Nate Alejandro | a week ago | Rating only. | Count toward negative sentiment; no specific requirement. |
| 26 | Alessandro Morari | a month ago | Rating only. | Count toward negative sentiment; no specific requirement. |
| 27 | nathan ottesen | 4 months ago | Rating only. | Count toward negative sentiment; no specific requirement. |
| 28 | Patience Walker | 5 months ago | Rating only; owner asked for details. | Capture low-rating feedback and create follow-up task. |
| 29 | Katie - | 5 months ago | Rating only. | Count toward negative sentiment; no specific requirement. |
| 30 | Ben Stummer | 7 months ago | Rating only. | Count toward negative sentiment; no specific requirement. |
| 31 | Sam Chen | 8 months ago | Rating only. | Count toward negative sentiment; no specific requirement. |
| 32 | Christian Feraria | a year ago | Rating only. | Count toward negative sentiment; no specific requirement. |

## Complaint Clusters

### 1. Human Handoff And Emergency Routing

Reviews repeatedly say users could not reach a person, including for emergencies. This is the highest trust risk.

First-release gates:

- The widget must offer an obvious human handoff path.
- “Emergency,” “urgent,” “maintenance emergency,” “legal,” “complaint,” “manager,” “representative,” and “human” must stop normal AI qualification and trigger escalation.
- During human takeover, AI must stop responding and tell the user a leasing specialist will review the message.
- The dashboard must have an agent reply composer, assignment, status, and SLA age for escalations.
- Properties must configure an escalation email/contact before going live.

Existing coverage:

- Conversation states already include `human_takeover`.
- Escalation rows and escalation email plumbing exist.
- Widget API already avoids invoking AI during human takeover.

Required before first release:

- Agent reply composer and takeover controls.
- Emergency/human-request eval suite.
- Operator alert delivery verification.
- Escalation SLA dashboard and unresolved escalation queue.

### 2. Calendar, Tour Booking, And Double-Booking

Several reviews call out double-booked tours, appointments created without operator awareness, and poor calendar sync.

First-release gates:

- Availability must come from calendar free/busy, not just office hours.
- Booking must be idempotent by conversation/prospect/slot.
- Booking must re-check availability immediately before creating a tour.
- Every booking must have an owner: property, agent, or routing queue.
- Operators must see every booked/rescheduled/canceled tour.
- The assistant must never claim a tour is booked until the booking transaction and provider write succeed.

Existing coverage:

- `OMN-119` adds Google Calendar free/busy availability and live OAuth/free/busy proof.

Required before first release:

- `OMN-145`: agent-level calendar routing and tour ownership.
- `OMN-120`: booking/reschedule/cancel tools with conflict checks and idempotency.
- `OMN-121`: confirmations, reminders, and post-tour follow-ups.
- `OMN-122`: tour dashboard and conversion reporting.

### 3. AI Disclosure, Consent, And Privacy

Reviewers objected to unknowingly talking to AI and to personal data being routed to a third-party system.

First-release gates:

- First assistant message must disclose that the user is chatting with an AI assistant for the property.
- The widget must link to privacy/terms or property-provided disclosure copy.
- SMS/email must require explicit consent and support opt-out before proactive messages.
- Conversation records must include source/channel, consent status, and handoff history.
- Operators must be able to export/delete conversation data by policy.

Existing coverage:

- Guest card schema includes email/SMS/marketing consent fields.
- Channel/source fields exist in conversation storage.

Required before first release:

- Visible AI disclosure in widget welcome/runtime copy.
- Consent capture and opt-out enforcement for SMS/email.
- Privacy disclosure configuration per property.
- Audit log for automated actions and handoffs.

### 4. Repetitive Questions, Poor Memory, And Low-Confidence Answers

Reviews mention repeated questions, inability to handle nuance, bad or unverifiable answers, and confusion around floorplans/applications.

First-release gates:

- The assistant must reuse known prospect details from conversation history.
- The assistant must not ask for the same field repeatedly once captured.
- Low-confidence or unsupported questions must route to human or answer with uncertainty.
- Pricing, fees, availability, floorplans, and application requirements must be sourced from structured data or approved knowledge.
- The system must log unanswered/low-confidence reasons for operator review.

Existing coverage:

- Conversation history, intent classification, property context, unit availability tool, safety tests, and golden evals exist.
- Knowledge validation warnings exist for property content.

Required before first release:

- Repetition guard tests.
- Source/confidence display in dashboard.
- Low-confidence escalation reason tracking.
- Structured application requirements and fee disclosure MVP (`OMN-146`).

### 5. Integration And Launch Readiness

Reviews describe integrations that did not work, rollout surprises, missed notifications, and slow processing.

First-release gates:

- A property cannot go live until widget install, escalation contact, tour provider, assistant settings, knowledge, and test conversations pass readiness checks.
- Provider configuration failures must be visible to operators.
- Every integration must have a “last checked,” “last success,” and “last error” status.
- Go-live must start in monitor mode or allowlist mode for at least one operating window.
- The product must define what is not supported and route those cases to human.

Existing coverage:

- Production pilot runbook already names readiness requirements.
- Calendar provider status is visible for tour settings.

Required before first release:

- Enforced readiness checklist in dashboard.
- Integration status panel.
- Pilot allowlist/test-mode controls.
- Performance and failure monitoring for AI/tool calls.

### 6. Unwanted Outreach And Messaging Frequency

Reviews complain about repeated texts and harassment-like behavior.

First-release gates:

- Proactive outreach must respect consent, quiet hours, frequency caps, and STOP/opt-out.
- Follow-up sequences must be visible and cancellable by operators.
- The assistant must not keep messaging after a user asks to stop or after a human takeover.

Existing coverage:

- Consent fields exist on guest cards.

Required before first release:

- SMS opt-out parser and enforcement.
- Message frequency/rate limits.
- Sequence suppression rules.
- Operator-visible scheduled follow-ups.

## First-Release Backlog

| Priority | Initiative | Ticket | Outcome |
| --- | --- | --- | --- |
| P0 | Human Trust | Human takeover reply workflow | Agents can reply, assign, resolve, and return conversations from AI to human safely. |
| P0 | Human Trust | Emergency and human-request routing | Urgent/human requests immediately escalate and stop normal AI qualification. |
| P0 | Human Trust | AI disclosure and privacy notice | Users know they are speaking to AI and can access privacy/terms copy. |
| P0 | Calendar Trust | Booking conflict and idempotency guard | No double-booked tours; booking re-checks provider availability before write. |
| P0 | Calendar Trust | Agent-level calendar ownership (`OMN-145`) | Tours route to a real accountable calendar/agent/queue. |
| P0 | Calendar Trust | Booking/reschedule/cancel tools (`OMN-120`) | Assistant can safely manage tours only after calendar checks pass. |
| P0 | Launch Safety | Go-live readiness checklist | Properties cannot launch with missing escalation, provider, knowledge, or test coverage. |
| P0 | Messaging Safety | Consent, opt-out, and frequency caps | No unwanted repeated SMS/email outreach. |
| P1 | Conversion Workflow | Tour confirmations/reminders (`OMN-121`) | Prospects and operators get confirmed state and reminders. |
| P1 | Conversion Workflow | Tour dashboard/reporting (`OMN-122`) | Operators see all scheduled tours, statuses, no-shows, and conversion metrics. |
| P1 | Answer Quality | Repetition guard and memory tests | Assistant stops asking for the same details and reuses captured data. |
| P1 | Answer Quality | Source/confidence and unknown fallback | Unsupported/uncertain questions route to human instead of guessing. |
| P1 | Applications/Fees | Quote, application link, fee disclosure (`OMN-146`) | Fee/application info is structured and auditable. |
| P1 | Operations | Integration status panel | Calendar/provider/tool health is visible with last success/error. |
| P2 | Resident Ops | Maintenance/billing resident routing | Non-leasing issues route to humans or resident systems; no AI-only support. |
| P2 | Analytics | Complaint and low-rating feedback loop | Negative feedback creates follow-up tasks and product insights. |

## Detailed P0 Tickets

### P0-1 Human Takeover Reply Workflow

- Problem: Reviews repeatedly say users could not reach a human.
- Scope: agent reply composer, assign/unassign, takeover/return-to-AI state, resolve, internal note, escalation SLA age.
- Out of scope: full call center or voice routing.
- Target areas: `apps/web/src/app/(dashboard)/conversations/[id]`, `packages/db/src/schema/conversations.ts`, `apps/web/src/app/api/widget/chat/route.ts`.
- Acceptance criteria:
  - [ ] Agent can take over and send a visible reply to the prospect.
  - [ ] AI stops responding while `automationState = human_takeover`.
  - [ ] Conversation list prioritizes unresolved escalations by age.
  - [ ] Operator can resolve or return to AI with an audit trail.
- Validation: integration test for takeover state, E2E widget-to-inbox reply test, escalation email test.

### P0-2 Emergency And Human-Request Routing

- Problem: Emergency/human requests must not get trapped in AI loops.
- Scope: intent rules, system prompt rules, escalation reasons, eval cases, UI labels for urgent escalations.
- Out of scope: dispatching real emergency services.
- Target areas: `apps/web/src/lib/conversation/intent.ts`, `safety.ts`, `tools.ts`, `golden-suite.ts`.
- Acceptance criteria:
  - [ ] “Emergency,” “urgent,” “manager,” “representative,” “human,” and similar phrases trigger escalation.
  - [ ] AI response tells user to use official emergency channels when appropriate.
  - [ ] No qualification/tour-booking flow continues after emergency/human escalation.
  - [ ] Dashboard shows emergency priority distinctly.
- Validation: golden evals, route integration tests, manual red-team script.

### P0-3 AI Disclosure And Privacy Notice

- Problem: Reviewers objected to unknowingly interacting with AI and third-party data handling.
- Scope: configurable AI disclosure, privacy/terms link, first-message disclosure, dashboard preview.
- Out of scope: legal drafting of privacy policy.
- Target areas: `apps/web/public/widget.js`, `apps/web/src/app/api/widget/session/route.ts`, property settings.
- Acceptance criteria:
  - [ ] First widget message says it is an AI assistant.
  - [ ] Widget exposes privacy/terms link or property-provided disclosure.
  - [ ] Operators can preview exact disclosure before install.
  - [ ] Disclosure is included in pilot checklist.
- Validation: widget E2E snapshot, session API test, accessibility check.

### P0-4 Booking Conflict And Idempotency Guard

- Problem: Reviews cite double-booked tours and appointments created without awareness.
- Scope: pre-booking free/busy re-check, idempotency key, booking transaction, audit row, provider failure fallback.
- Out of scope: reminders and reporting.
- Target areas: `apps/web/src/lib/tour-availability.ts`, future tour booking service/schema.
- Acceptance criteria:
  - [ ] Booking fails safely if slot is busy during final re-check.
  - [ ] Duplicate tool calls do not create duplicate tours.
  - [ ] Provider write failure leaves no “confirmed” user message.
  - [ ] Operator can see who/what created each tour.
- Validation: mocked provider tests, live Google Calendar write/free-busy E2E, booking route integration test.

### P0-5 Go-Live Readiness Checklist

- Problem: Reviews mention surprise rollout and integrations that were not actually ready.
- Scope: checklist for escalation contact, AI disclosure, knowledge, assistant settings, calendar provider, test conversations, failover contact.
- Out of scope: full customer onboarding automation.
- Target areas: property dashboard, production pilot runbook.
- Acceptance criteria:
  - [ ] Dashboard shows pass/fail readiness.
  - [ ] Missing escalation/provider/disclosure blocks “live” status.
  - [ ] Test conversation outcomes are recorded.
  - [ ] Operator can run pilot in monitor/allowlist mode.
- Validation: unit tests for readiness evaluator, dashboard test, manual launch checklist.

### P0-6 Consent, Opt-Out, And Messaging Frequency Caps

- Problem: Reviews cite unwanted repeated outreach.
- Scope: SMS/email consent fields, STOP opt-out enforcement, quiet hours, frequency caps, sequence suppression after human takeover.
- Out of scope: voice compliance.
- Target areas: guest card consent fields, future outbound messaging service.
- Acceptance criteria:
  - [ ] STOP/opt-out prevents future outbound automation.
  - [ ] Follow-ups honor quiet hours and max-send rules.
  - [ ] Operators can cancel scheduled follow-ups.
  - [ ] Consent status is visible on guest card and conversation.
- Validation: unit tests for suppression, integration tests for outbound scheduling, manual compliance script.

## Next Five Implementation Actions

1. Finish `OMN-145` so every tour route has a real owner and calendar target.
2. Implement `OMN-120` with final free/busy re-check, idempotency, provider write proof, and no-confirm-before-write rules.
3. Add human takeover reply workflow before expanding tour automation.
4. Add emergency/human-request evals and dashboard priority labels.
5. Add AI disclosure/privacy notice and go-live readiness checklist.

## Success Metrics

- Human handoff success: 100% of explicit human/emergency requests create an escalation and stop AI automation.
- Tour correctness: 0 duplicate confirmed tours for the same prospect/slot; 0 confirmations without provider write success.
- Operator awareness: 100% of AI-created bookings and escalations appear in dashboard activity within 5 seconds.
- Messaging safety: 100% opt-out suppression for future automated outreach.
- Answer quality: repeated-question rate below 2% in golden evals and pilot transcripts.
- Launch safety: no property goes live with incomplete escalation contact, disclosure, provider status, or knowledge readiness.

## Release Decision Gate

First release should not ship as “AI replaces the leasing office.” It should ship as “AI answers routine leasing questions, books tours only when calendar-verified, and reliably routes humans into anything urgent, uncertain, sensitive, or unsupported.”
