# Phase B Release Gate

OMN-153 is the final production gate for Phase B. It ties the EliseAI Google
review complaint inventory to concrete implementation proof, live evidence, and
the property readiness evaluator.

Source complaint plan: `docs/eliseai-google-review-complaint-response-plan.md`

## Gate Rules

Phase B is not approved for first production release until all of these are
true:

- Every blocking story below is `Done` in Linear with a proof comment.
- Each complaint cluster has implementation evidence and the named live or
  browser evidence where relevant.
- The pilot property passes the dashboard Phase B Go-Live Readiness panel.
- Launch mode is monitor or allowlist before production exposure.
- Validation script results are recorded for pricing, availability, fees, tours,
  and human handoff.
- A final OMN-153 proof comment maps complaint clusters to evidence and records
  the go/no-go decision.

## Blocking Stories

- `OMN-119`: calendar availability provider for tour slots.
- `OMN-120`: AI tools for booking, rescheduling, and canceling tours.
- `OMN-121`: tour confirmations, reminders, and post-tour follow-ups.
- `OMN-122`: tour dashboard and tour conversion reporting.
- `OMN-141`: launch, training, and allowlist testing checklist.
- `OMN-145`: agent-level calendar routing and tour ownership.
- `OMN-146`: quote, application link, and fee disclosure MVP.
- `OMN-153`: complaint-derived trust checklist and final gate.
- `OMN-154`: emergency and human-request escalation hardening.
- `OMN-155`: AI disclosure, privacy notice, and human contact fallback.
- `OMN-156`: consent, opt-out, quiet hours, and follow-up frequency caps.
- `OMN-157`: answer-quality guardrails for repetition and unsupported workflows.
- `OMN-158`: dashboard go-live readiness checklist enforcement.

## Complaint Cluster Evidence Matrix

| Complaint cluster | Blocking stories | Required release evidence |
| --- | --- | --- |
| Human handoff and emergency routing | `OMN-154`, `OMN-157`, `OMN-158` | Escalation intent tests, widget/chat integration proof, dashboard takeover/browser proof, readiness `escalation-contact` and `test-conversations` pass. |
| AI disclosure, privacy, and contact fallback | `OMN-155`, `OMN-158` | Widget disclosure unit/integration proof, browser preview proof, readiness `ai-disclosure`, `privacy-contact-fallback`, and `consent-disclosure` pass. |
| Calendar-backed tour booking and ownership | `OMN-119`, `OMN-120`, `OMN-121`, `OMN-122`, `OMN-145`, `OMN-158` | Calendar live proof where credentials are available, booking/reschedule/cancel integration proof, notification scheduling proof, tour owner proof, dashboard tour reporting proof. |
| Consent, opt-out, quiet hours, and frequency caps | `OMN-121`, `OMN-156`, `OMN-158` | Outreach safety unit proof, notification scheduling integration proof, suppression and quiet-hours evidence. |
| Repetition, uncertainty, and unsupported workflow fallback | `OMN-154`, `OMN-157`, `OMN-158` | Golden evals, answer-quality unit proof, emergency/legal/privacy/payment/application-blocking route-to-human proof. |
| Quote, application link, and fee transparency | `OMN-146`, `OMN-157`, `OMN-158` | Quote fee unit proof, quote tool integration proof, readiness validation prompts for pricing and fees. |
| Dashboard visibility for AI-created actions and failures | `OMN-121`, `OMN-122`, `OMN-145`, `OMN-158` | Conversation, tour, provider health, owner routing, notification, and readiness views are visible in dashboard/browser review. |
| Launch readiness and allowlist testing | `OMN-141`, `OMN-153`, `OMN-158` | Launch checklist, property readiness panel, monitor/allowlist mode, recorded validation script, final go/no-go comment. |

## Final Proof Comment Template

```markdown
Phase B release gate complete.

Blocking stories:
- OMN-119 Done with proof
- OMN-120 Done with proof
- OMN-121 Done with proof
- OMN-122 Done with proof
- OMN-141 Done with proof
- OMN-145 Done with proof
- OMN-146 Done with proof
- OMN-154 Done with proof
- OMN-155 Done with proof
- OMN-156 Done with proof
- OMN-157 Done with proof
- OMN-158 Done with proof

Complaint cluster evidence:
- Human handoff/emergency:
- AI disclosure/privacy/contact fallback:
- Calendar tour booking/ownership:
- Consent/opt-out/quiet hours/frequency:
- Repetition/uncertainty/unsupported fallback:
- Quote/application/fee transparency:
- Dashboard visibility:
- Launch readiness/allowlist:

Verification:
- Unit:
- Integration:
- Build/typecheck:
- Browser/live evidence:

Decision:
- [ ] Go
- [ ] No-go
```
