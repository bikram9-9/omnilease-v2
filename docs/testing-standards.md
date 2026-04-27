# Testing Standards

Every Linear story must finish with story-specific tests, command evidence, and a Linear comment before it is moved to Done.

## Command Spine

Use these commands as the default quality gate:

```bash
pnpm test:unit
pnpm test:evals
pnpm test:integration
pnpm lint
pnpm typecheck
pnpm build
pnpm ci:verify
BASE_URL=http://localhost:3000 pnpm e2e:smoke
```

`pnpm ci:verify` forces Turbo to run fresh lint, typecheck, unit, integration, and build tasks instead of accepting cached results.

The browser smoke script has deterministic local defaults:

- `E2E_EMAIL=e2e-smoke@omnilease.local`
- `E2E_PASSWORD=OmniLeaseE2E!2026`
- `E2E_WIDGET_ID=wdg_e2e_smoke`

For localhost targets it attempts to seed that user, org, property, widget ID,
unit, and published knowledge automatically via `apps/web/scripts/seed-e2e-smoke.mjs`.
Remote Supabase seeding is blocked unless `E2E_ALLOW_REMOTE_SEED=1` is set.
If a seeded auth user is unavailable, the browser smoke falls back to signing up
with the same deterministic credentials and completing onboarding.

## Required Story Coverage

For every implementation story:

- Schema changes need migration/schema tests and rollback or compatibility notes.
- Validators need valid, invalid, boundary, and ownership-aware cases.
- Server actions and API routes need success, validation failure, auth failure, and idempotency tests where relevant.
- AI tools and prompts need deterministic unit tests around inputs, expected tool calls, safety, and escalation boundaries.
- Prompt, tool, or model-config changes require `pnpm test:evals`; the golden conversation suite must stay at or above the configured release threshold.
- Outbound side effects need tests that mock the provider boundary and assert the payload.
- User-visible flows need browser or manual E2E proof that exercises the feature through the product surface.

## Linear Proof Template

Post this evidence to the Linear ticket before closing it:

```markdown
Implementation complete.

Proof of completion:
- Delivered: [story behavior]
- Changed: [files, PR, branch, or deployment]
- E2E: [scenario/path exercised]

Verification:
- `pnpm test:unit` - passed
- `pnpm test:integration` - passed
- `pnpm lint` - passed
- `pnpm typecheck` - passed
- `pnpm build` - passed
- `BASE_URL=http://localhost:3000 pnpm e2e:smoke` - passed/skipped with reason

Notes:
- [risks, blockers, follow-ups, or None]
```

If any required command cannot run, leave the story open unless the Linear comment names the blocker, the substitute proof, and the next action.
