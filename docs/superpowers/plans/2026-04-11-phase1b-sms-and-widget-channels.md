# Phase 1b — SMS + Widget Channels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Plan 1a conversation engine to two real inbound channels — Twilio SMS and an embeddable webchat widget — with TCPA compliance primitives on the outbound path, ending with both channels driving `processConversation` end-to-end against a real local Supabase plus a Twilio signature-verified webhook test.

**Architecture:** Two new entry points (a Twilio webhook Route Handler using Next.js `after()` for the async LLM work, and a widget chat Route Handler using AI SDK `streamText` + `toUIMessageStreamResponse()` for live streaming). Both funnel into the shared engine. A thin `lib/twilio/*` wraps the Twilio SDK with signature verification and opt-out-aware sending. A `lib/tcpa/*` pair enforces opt-out lists and quiet-hours rules. The widget itself is a single hand-written ES module in `apps/web/public/widget.js` — no build step, no React.

**Tech Stack:** Next.js 16 Route Handlers (Fluid Compute), Twilio Node SDK, AI SDK v6 `streamText` + `toUIMessageStreamResponse`, Supabase Postgres + Drizzle, Vitest for unit + integration tests, hand-written vanilla JS for the widget.

**Source spec:** `docs/superpowers/specs/2026-04-11-phase1-ai-answering-service-design.md` (sections §6.1, §6.2, §6.6, §6.7, §4.1 boundary rules)

**Prior state (Plan 1a merged on main):**
- Conversation engine lives in `apps/web/src/lib/conversation/`:
  - `engine.ts` exports `processConversation({ conversationId, propertyId, inboundText })` — the non-streaming entry point
  - `system-prompt.ts`, `history.ts`, `tools.ts`, `safety.ts`, `intent.ts`, `escalate.ts` — all tested
- Resend email helper at `apps/web/src/lib/email/resend.ts`
- Migrations 0000-0005 applied locally. `messages` has `author_type` and `metadata` columns. `sms_opt_outs` and `consent_records` tables exist with RLS.
- Local Supabase runs on offset ports (db: 54622) per `supabase/config.toml`
- `.env.test.local` exists with `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54622/postgres` and fake RESEND keys
- Vitest setup: `apps/web/vitest.setup.ts` loads `.env.test.local` via dotenv before test modules evaluate
- Test runner pattern: mock at the module boundary (`vi.mock('ai', ...)`, `vi.mock('@/lib/email/resend', ...)` using `vi.hoisted()` for var refs)
- AI SDK v6 is installed (`ai@6.0.158`). Models route through AI Gateway via string (`"anthropic/claude-sonnet-4.6"`) with OIDC auth

**Non-goals for this plan:** No dashboard pages (conversations list, composer, escalations queue, analytics) — all deferred to Plan 1c. No human takeover path on the widget (requires the dashboard composer, also Plan 1c). No follow-up sequences, email channel, tour scheduling — all Phase 2.

---

## File Structure

```
apps/web/
├── public/
│   └── widget.js                           # NEW — embeddable vanilla JS widget
│
├── src/
│   ├── app/
│   │   └── api/
│   │       ├── webhooks/twilio/sms/
│   │       │   ├── route.ts                # NEW — inbound SMS webhook
│   │       │   └── status/route.ts         # NEW — delivery status callback
│   │       └── widget/
│   │           ├── session/route.ts        # NEW — POST init session
│   │           └── chat/route.ts           # NEW — POST message, stream SSE
│   │
│   └── lib/
│       ├── twilio/
│       │   ├── client.ts                   # NEW — lazy Twilio SDK client
│       │   ├── verify.ts                   # NEW — X-Twilio-Signature check
│       │   └── send.ts                     # NEW — sendSms with TCPA guards
│       ├── tcpa/
│       │   ├── opt-outs.ts                 # NEW — isOptedOut, markOptedOut, isStopKeyword
│       │   └── quiet-hours.ts              # NEW — isWithinQuietHours, isDirectReplyWindow
│       └── conversation/
│           └── engine.ts                   # MODIFIED — add streamConversationForWidget
│
├── package.json                            # +twilio dep
└── .env.example                            # +TWILIO_* + WIDGET_APP_URL

packages/
└── db/
    └── src/index.ts                        # may need to re-export `desc` or other helpers used by the SMS webhook (verify)
```

### Responsibility boundaries

- **`lib/twilio/*` is the only place that imports `twilio`.** The webhook route imports `verifyTwilioSignature` from `verify.ts`; outbound calls go through `sendSms` in `send.ts`; both lazy-init through `client.ts`.
- **`lib/tcpa/*` is the only place that reads/writes `sms_opt_outs` and `consent_records`.** The SMS webhook and `sendSms` both call into this module.
- **`lib/conversation/engine.ts` gains a second entry point** (`streamConversationForWidget`) but the existing `processConversation` stays byte-for-byte identical — Plan 1a's integration test must keep passing unmodified.
- **`public/widget.js` is a single self-contained ES module** — no bundler, no React, no TS transpilation. Tests use a Playwright-style browser or a raw Node stub; Plan 1b just ships the file + integration test for the server route.
- **The SMS webhook Route Handler does nothing LLM-related.** It validates, persists the inbound, ACKs Twilio, and delegates to `processConversation` via Next.js `after()`. The handler is a transport layer.
- **The widget chat route IS the LLM streaming path.** It can't use `after()` because it needs to stream tokens back to the browser.

---

## Tasks

### Task 1: Install `twilio`, add env vars

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/web/.env.example`

- [ ] **Step 1: Install the Twilio SDK**

```bash
pnpm --filter @omnilease/web add twilio@^5
```

Verify that `apps/web/package.json` now has `twilio` under `dependencies` with a `^5.x.x` range.

- [ ] **Step 2: Append env var docs to `.env.example`**

Append this block at the end of `apps/web/.env.example`:

```bash

# ---- Twilio (SMS inbound + outbound) ----
# Account SID and Auth Token from https://console.twilio.com
# These are the only creds needed — signatures on inbound webhooks are verified
# via TWILIO_AUTH_TOKEN, and outbound sends use TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN.
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
# Public URL of this app — used by the SMS webhook to reconstruct the full
# URL for signature verification, and by the escalation email template.
# In production this is set by the Vercel deployment; in local dev point it
# at your tunnel (ngrok/cloudflared) when testing real Twilio traffic.
APP_URL=http://localhost:3000
```

- [ ] **Step 3: Also add to `.env.test.local` so tests can use fake values**

Append to `apps/web/.env.test.local`:

```bash

TWILIO_ACCOUNT_SID=ACfake1234567890abcdef
TWILIO_AUTH_TOKEN=fake_auth_token_for_tests
```

(`APP_URL` is already set in `.env.test.local` from Plan 1a.)

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @omnilease/web typecheck
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/.env.example apps/web/.env.test.local pnpm-lock.yaml
git commit -m "chore(web): add twilio sdk v5 and document env vars for sms channel"
```

---

### Task 2: Write `lib/twilio/verify.ts` with unit tests (TDD)

**Files:**
- Create: `apps/web/src/lib/twilio/__tests__/verify.test.ts`
- Create: `apps/web/src/lib/twilio/verify.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/twilio/__tests__/verify.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyTwilioSignature } from '../verify';

// Twilio computes the signature as:
//   HMAC-SHA1(authToken, url + sortedParamConcat)
// base64-encoded. We replicate that here so the test owns the crypto contract.
function signRequest(authToken: string, url: string, params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  const data = url + sortedKeys.map((k) => `${k}${params[k]}`).join('');
  return createHmac('sha1', authToken).update(data).digest('base64');
}

describe('verifyTwilioSignature', () => {
  const authToken = 'test_token';
  const url = 'https://app.example.com/api/webhooks/twilio/sms';
  const params = {
    From: '+15551234567',
    To: '+15557654321',
    Body: 'Hello',
    MessageSid: 'SM1234',
  };

  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = authToken;
    process.env.APP_URL = 'https://app.example.com';
  });

  it('accepts a correctly-signed request', () => {
    const signature = signRequest(authToken, url, params);
    expect(verifyTwilioSignature({ signature, url, params })).toBe(true);
  });

  it('rejects a request with a tampered body', () => {
    const signature = signRequest(authToken, url, params);
    const tampered = { ...params, Body: 'Different text' };
    expect(verifyTwilioSignature({ signature, url, params: tampered })).toBe(false);
  });

  it('rejects a request with a wrong auth token', () => {
    const signature = signRequest('other_token', url, params);
    expect(verifyTwilioSignature({ signature, url, params })).toBe(false);
  });

  it('rejects a request with a different URL', () => {
    const signature = signRequest(authToken, url, params);
    expect(
      verifyTwilioSignature({
        signature,
        url: 'https://app.example.com/api/webhooks/twilio/sms?extra=1',
        params,
      }),
    ).toBe(false);
  });

  it('throws if TWILIO_AUTH_TOKEN is not set', () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    expect(() =>
      verifyTwilioSignature({ signature: 'any', url, params }),
    ).toThrow(/TWILIO_AUTH_TOKEN/);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
pnpm --filter @omnilease/web test src/lib/twilio/__tests__/verify.test.ts 2>&1 | tail -20
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `verify.ts`**

Create `apps/web/src/lib/twilio/verify.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export type VerifyInput = {
  signature: string;            // X-Twilio-Signature header value
  url: string;                  // fully-qualified request URL (scheme + host + path + query)
  params: Record<string, string>; // application/x-www-form-urlencoded body params
};

/**
 * Verify that an inbound Twilio webhook was signed with our TWILIO_AUTH_TOKEN.
 *
 * Algorithm (per Twilio docs):
 *   signature = base64( HMAC-SHA1( authToken, url + sortedParamConcat ) )
 *   where sortedParamConcat = params sorted by key, concatenated as `${k}${v}`
 *
 * Throws if TWILIO_AUTH_TOKEN is missing from the environment (not a runtime
 * "return false" — a missing token is a misconfiguration, not a failed
 * verification).
 */
export function verifyTwilioSignature(input: VerifyInput): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) throw new Error('TWILIO_AUTH_TOKEN is not set');

  const sortedKeys = Object.keys(input.params).sort();
  const concat = input.url + sortedKeys.map((k) => `${k}${input.params[k]}`).join('');

  const expected = createHmac('sha1', token).update(concat).digest('base64');

  // Constant-time comparison to avoid timing oracle attacks.
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
pnpm --filter @omnilease/web test src/lib/twilio/__tests__/verify.test.ts 2>&1 | tail -20
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/twilio/verify.ts apps/web/src/lib/twilio/__tests__/verify.test.ts
git commit -m "feat(web): twilio webhook signature verification with tests"
```

---

### Task 3: Write `lib/twilio/client.ts`

**Files:**
- Create: `apps/web/src/lib/twilio/client.ts`

- [ ] **Step 1: Create the module**

Create `apps/web/src/lib/twilio/client.ts`:

```ts
import twilio, { type Twilio } from 'twilio';

let cached: Twilio | null = null;

/**
 * Lazy-initialised Twilio client. We instantiate on first use so that code
 * paths that never touch Twilio (e.g. widget-only requests, unit tests
 * mocking at the `sendSms` boundary) don't need TWILIO_* env vars set.
 */
export function getTwilioClient(): Twilio {
  if (cached) return cached;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid) throw new Error('TWILIO_ACCOUNT_SID is not set');
  if (!token) throw new Error('TWILIO_AUTH_TOKEN is not set');
  cached = twilio(sid, token);
  return cached;
}

/**
 * Reset the cached client — only call from tests between mock swaps.
 */
export function __resetTwilioClient(): void {
  cached = null;
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @omnilease/web typecheck
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/twilio/client.ts
git commit -m "feat(web): lazy twilio sdk client factory"
```

---

### Task 4: Write `lib/tcpa/opt-outs.ts` with tests

**Files:**
- Create: `apps/web/src/lib/tcpa/__tests__/opt-outs.test.ts`
- Create: `apps/web/src/lib/tcpa/opt-outs.ts`

This is an integration test (real Supabase) for the opt-out write/read path, plus a pure unit test for STOP keyword detection.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/tcpa/__tests__/opt-outs.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db, eq } from '@omnilease/db';
import { organizations, properties, smsOptOuts } from '@omnilease/db';
import { isOptedOut, markOptedOut, isStopKeyword } from '../opt-outs';

const TEST_PREFIX = 'tcpa-test-';

async function seedProperty() {
  const [org] = await db
    .insert(organizations)
    .values({
      name: `${TEST_PREFIX}org`,
      slug: `${TEST_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      plan: 'starter',
    })
    .returning();
  const [prop] = await db
    .insert(properties)
    .values({
      orgId: org.id,
      name: 'Test Property',
      timezone: 'America/Chicago',
    })
    .returning();
  return { orgId: org.id, propertyId: prop.id };
}

async function cleanup(orgId: string) {
  await db.delete(organizations).where(eq(organizations.id, orgId));
}

describe('isStopKeyword (pure)', () => {
  it.each([
    ['STOP', true],
    ['stop', true],
    ['Stop', true],
    ['  STOP  ', true],
    ['UNSUBSCRIBE', true],
    ['CANCEL', true],
    ['END', true],
    ['QUIT', true],
    ['hello', false],
    ['stop it please', false], // multi-word — not a bare STOP command
    ['', false],
  ])('returns %s for "%s"', (input, expected) => {
    expect(isStopKeyword(input as string)).toBe(expected);
  });
});

describe('markOptedOut + isOptedOut (integration)', () => {
  let orgId: string;
  let propertyId: string;

  beforeEach(async () => {
    const seeded = await seedProperty();
    orgId = seeded.orgId;
    propertyId = seeded.propertyId;
  });

  it('returns false before any opt-out is recorded', async () => {
    try {
      expect(await isOptedOut(propertyId, '+15551111111')).toBe(false);
    } finally {
      await cleanup(orgId);
    }
  });

  it('returns true after markOptedOut', async () => {
    try {
      await markOptedOut(propertyId, '+15552222222', 'STOP');
      expect(await isOptedOut(propertyId, '+15552222222')).toBe(true);
    } finally {
      await cleanup(orgId);
    }
  });

  it('is per-property — opting out at property A does not affect property B', async () => {
    const other = await seedProperty();
    try {
      await markOptedOut(propertyId, '+15553333333', 'STOP');
      expect(await isOptedOut(propertyId, '+15553333333')).toBe(true);
      expect(await isOptedOut(other.propertyId, '+15553333333')).toBe(false);
    } finally {
      await cleanup(orgId);
      await cleanup(other.orgId);
    }
  });

  it('markOptedOut is idempotent — calling twice does not throw', async () => {
    try {
      await markOptedOut(propertyId, '+15554444444', 'STOP');
      await markOptedOut(propertyId, '+15554444444', 'STOP');
      const rows = await db
        .select()
        .from(smsOptOuts)
        .where(eq(smsOptOuts.propertyId, propertyId));
      expect(rows.length).toBe(1); // unique index prevents dup
    } finally {
      await cleanup(orgId);
    }
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
pnpm --filter @omnilease/web test src/lib/tcpa/__tests__/opt-outs.test.ts 2>&1 | tail -20
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `opt-outs.ts`**

Create `apps/web/src/lib/tcpa/opt-outs.ts`:

```ts
import { db, and, eq } from '@omnilease/db';
import { smsOptOuts, type OptOutKeyword } from '@omnilease/db';

const STOP_KEYWORDS: readonly string[] = ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];

/**
 * True if the inbound body is a standalone STOP-family keyword.
 * Whitespace is trimmed; case is ignored. Multi-word messages that
 * *contain* "stop" are not treated as opt-outs — only bare commands.
 */
export function isStopKeyword(body: string): boolean {
  const trimmed = body.trim().toUpperCase();
  return STOP_KEYWORDS.includes(trimmed);
}

/**
 * Check whether this phone has opted out of messages from this property.
 * Returns false if the property_id / phone tuple has no row.
 */
export async function isOptedOut(propertyId: string, phone: string): Promise<boolean> {
  const [row] = await db
    .select({ id: smsOptOuts.id })
    .from(smsOptOuts)
    .where(and(eq(smsOptOuts.propertyId, propertyId), eq(smsOptOuts.phone, phone)))
    .limit(1);
  return Boolean(row);
}

/**
 * Record an opt-out. Idempotent via the (property_id, phone) unique index —
 * a second call for the same pair is a silent no-op.
 */
export async function markOptedOut(
  propertyId: string,
  phone: string,
  keyword: OptOutKeyword,
): Promise<void> {
  await db
    .insert(smsOptOuts)
    .values({ propertyId, phone, keyword })
    .onConflictDoNothing({ target: [smsOptOuts.propertyId, smsOptOuts.phone] });
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
pnpm --filter @omnilease/web test src/lib/tcpa/__tests__/opt-outs.test.ts 2>&1 | tail -30
```
Expected: PASS (11 pure + 4 integration = 15 tests).

**Likely issue:** `onConflictDoNothing({ target: [...] })` may need explicit column references via `smsOptOuts.propertyId`. If typecheck fails on the target spec, use the string form:
```ts
.onConflictDoNothing({ target: [smsOptOuts.propertyId, smsOptOuts.phone] })
```
is the correct form for drizzle 0.36+. If it still complains, use `.onConflictDoNothing()` without target and rely on the unique index.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/tcpa/opt-outs.ts apps/web/src/lib/tcpa/__tests__/opt-outs.test.ts
git commit -m "feat(web): tcpa opt-outs module with STOP keyword detection and persistence"
```

---

### Task 5: Write `lib/tcpa/quiet-hours.ts` with unit tests

**Files:**
- Create: `apps/web/src/lib/tcpa/__tests__/quiet-hours.test.ts`
- Create: `apps/web/src/lib/tcpa/quiet-hours.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/tcpa/__tests__/quiet-hours.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { isWithinQuietHours, isDirectReplyWindow } from '../quiet-hours';

/**
 * Freeze time to a specific UTC moment, optionally asserting the local
 * hour in a timezone for a self-documenting test label.
 */
function freezeTo(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe('isWithinQuietHours', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Quiet hours are 9pm-8am local. Property timezone = America/Chicago (UTC-5 during DST).
  // 2026-06-15 02:30 UTC = 2026-06-14 21:30 local → in quiet hours
  // 2026-06-15 10:30 UTC = 2026-06-15 05:30 local → in quiet hours
  // 2026-06-15 14:30 UTC = 2026-06-15 09:30 local → NOT in quiet hours
  // 2026-06-15 23:30 UTC = 2026-06-15 18:30 local → NOT in quiet hours
  // 2026-06-16 01:30 UTC = 2026-06-15 20:30 local → NOT in quiet hours (20:30 < 21:00)
  // 2026-06-16 02:00 UTC = 2026-06-15 21:00 local → in quiet hours (21:00 boundary inclusive)

  it('9:30pm local is within quiet hours', () => {
    freezeTo('2026-06-15T02:30:00Z');
    expect(isWithinQuietHours('America/Chicago')).toBe(true);
  });

  it('5:30am local is within quiet hours', () => {
    freezeTo('2026-06-15T10:30:00Z');
    expect(isWithinQuietHours('America/Chicago')).toBe(true);
  });

  it('9:30am local is NOT within quiet hours', () => {
    freezeTo('2026-06-15T14:30:00Z');
    expect(isWithinQuietHours('America/Chicago')).toBe(false);
  });

  it('6:30pm local is NOT within quiet hours', () => {
    freezeTo('2026-06-15T23:30:00Z');
    expect(isWithinQuietHours('America/Chicago')).toBe(false);
  });

  it('8:30pm local is NOT within quiet hours (before 9pm boundary)', () => {
    freezeTo('2026-06-16T01:30:00Z');
    expect(isWithinQuietHours('America/Chicago')).toBe(false);
  });

  it('9:00pm local IS within quiet hours (inclusive boundary)', () => {
    freezeTo('2026-06-16T02:00:00Z');
    expect(isWithinQuietHours('America/Chicago')).toBe(true);
  });

  it('handles a different timezone', () => {
    // 2026-06-15 14:30 UTC = 2026-06-15 10:30 America/New_York
    freezeTo('2026-06-15T14:30:00Z');
    expect(isWithinQuietHours('America/New_York')).toBe(false);
  });
});

describe('isDirectReplyWindow', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true if the last inbound was within the last 15 minutes', () => {
    freezeTo('2026-06-15T14:30:00Z');
    const fiveMinAgo = new Date('2026-06-15T14:25:00Z');
    expect(isDirectReplyWindow(fiveMinAgo)).toBe(true);
  });

  it('returns true at exactly 15 minutes', () => {
    freezeTo('2026-06-15T14:30:00Z');
    const fifteenMinAgo = new Date('2026-06-15T14:15:00Z');
    expect(isDirectReplyWindow(fifteenMinAgo)).toBe(true);
  });

  it('returns false if the last inbound was 16 minutes ago', () => {
    freezeTo('2026-06-15T14:30:00Z');
    const sixteenMinAgo = new Date('2026-06-15T14:14:00Z');
    expect(isDirectReplyWindow(sixteenMinAgo)).toBe(false);
  });

  it('returns false if lastInboundAt is null', () => {
    freezeTo('2026-06-15T14:30:00Z');
    expect(isDirectReplyWindow(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
pnpm --filter @omnilease/web test src/lib/tcpa/__tests__/quiet-hours.test.ts 2>&1 | tail -20
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `quiet-hours.ts`**

Create `apps/web/src/lib/tcpa/quiet-hours.ts`:

```ts
/**
 * TCPA quiet hours: no unsolicited messaging between 9pm and 8am local time.
 * "Local" means the property's configured timezone.
 *
 * Direct replies (within ~15 minutes of an inbound) are exempt under TCPA
 * because they're responses to an active conversation, not unsolicited outreach.
 */

const QUIET_START_HOUR = 21; // 9pm (inclusive)
const QUIET_END_HOUR = 8;    // 8am (exclusive)
const DIRECT_REPLY_WINDOW_MS = 15 * 60 * 1000;

/**
 * Returns the hour (0 through 23) of `date` as observed in `timeZone`.
 * Uses Intl.DateTimeFormat for correct DST handling.
 */
function localHour(date: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  });
  // Intl may format "24" for midnight in some locales — coerce to 0.
  const hourStr = fmt.format(date);
  const hour = Number(hourStr);
  return hour === 24 ? 0 : hour;
}

/**
 * True if the current time falls within quiet hours (9pm–8am) in the given
 * property timezone. Inclusive of 9pm, exclusive of 8am.
 */
export function isWithinQuietHours(timeZone: string, now: Date = new Date()): boolean {
  const hour = localHour(now, timeZone);
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/**
 * True if the last inbound message was recent enough to make a reply count
 * as a direct-conversation response rather than an unsolicited outbound.
 * Direct replies bypass quiet-hours enforcement.
 */
export function isDirectReplyWindow(lastInboundAt: Date | null, now: Date = new Date()): boolean {
  if (!lastInboundAt) return false;
  const delta = now.getTime() - lastInboundAt.getTime();
  return delta >= 0 && delta <= DIRECT_REPLY_WINDOW_MS;
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
pnpm --filter @omnilease/web test src/lib/tcpa/__tests__/quiet-hours.test.ts 2>&1 | tail -20
```
Expected: PASS (11 tests).

**Gotcha to watch:** `Intl.DateTimeFormat` for a specific timezone may return `"24"` for midnight in some locales; the `localHour` helper handles this. If any test fails unexpectedly around midnight, check what the formatter returned.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/tcpa/quiet-hours.ts apps/web/src/lib/tcpa/__tests__/quiet-hours.test.ts
git commit -m "feat(web): tcpa quiet-hours + direct-reply-window helpers"
```

---

### Task 6: Write `lib/twilio/send.ts` with tests

**Files:**
- Create: `apps/web/src/lib/twilio/__tests__/send.test.ts`
- Create: `apps/web/src/lib/twilio/send.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/twilio/__tests__/send.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the twilio client factory at the module boundary — we don't want to
// hit the real twilio SDK (no auth in tests, no real network).
const messagesCreateMock = vi.hoisted(() => vi.fn());
vi.mock('../client', () => ({
  getTwilioClient: () => ({
    messages: { create: messagesCreateMock },
  }),
  __resetTwilioClient: () => {},
}));

// Also mock the tcpa guards so we can control their return values per test.
const isOptedOutMock = vi.hoisted(() => vi.fn());
const isWithinQuietHoursMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/tcpa/opt-outs', () => ({
  isOptedOut: isOptedOutMock,
  isStopKeyword: (s: string) => s.trim().toUpperCase() === 'STOP',
  markOptedOut: vi.fn(),
}));
vi.mock('@/lib/tcpa/quiet-hours', () => ({
  isWithinQuietHours: isWithinQuietHoursMock,
  isDirectReplyWindow: () => false, // overridden in direct-reply tests
}));

import { sendSms, OptedOutError, QuietHoursError } from '../send';

describe('sendSms', () => {
  beforeEach(() => {
    messagesCreateMock.mockReset();
    isOptedOutMock.mockReset();
    isWithinQuietHoursMock.mockReset();
    messagesCreateMock.mockResolvedValue({ sid: 'SM_fake' });
    isOptedOutMock.mockResolvedValue(false);
    isWithinQuietHoursMock.mockReturnValue(false);
  });

  const baseArgs = {
    propertyId: 'prop_1',
    propertyTimezone: 'America/Chicago',
    from: '+15550000000',
    to: '+15551234567',
    body: 'Hello',
    directReply: false,
  };

  it('sends the message when not opted out and outside quiet hours', async () => {
    await sendSms(baseArgs);
    expect(messagesCreateMock).toHaveBeenCalledTimes(1);
    const call = messagesCreateMock.mock.calls[0][0];
    expect(call.from).toBe('+15550000000');
    expect(call.to).toBe('+15551234567');
    expect(call.body).toBe('Hello');
  });

  it('throws OptedOutError without calling Twilio if the recipient has opted out', async () => {
    isOptedOutMock.mockResolvedValue(true);
    await expect(sendSms(baseArgs)).rejects.toBeInstanceOf(OptedOutError);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('throws QuietHoursError when outside quiet hours is false AND not a direct reply', async () => {
    isWithinQuietHoursMock.mockReturnValue(true);
    await expect(sendSms(baseArgs)).rejects.toBeInstanceOf(QuietHoursError);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('sends during quiet hours when directReply=true', async () => {
    isWithinQuietHoursMock.mockReturnValue(true);
    await sendSms({ ...baseArgs, directReply: true });
    expect(messagesCreateMock).toHaveBeenCalledTimes(1);
  });

  it('propagates Twilio SDK errors', async () => {
    messagesCreateMock.mockRejectedValue(new Error('rate_limited'));
    await expect(sendSms(baseArgs)).rejects.toThrow(/rate_limited/);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
pnpm --filter @omnilease/web test src/lib/twilio/__tests__/send.test.ts 2>&1 | tail -20
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `send.ts`**

Create `apps/web/src/lib/twilio/send.ts`:

```ts
import { getTwilioClient } from './client';
import { isOptedOut } from '@/lib/tcpa/opt-outs';
import { isWithinQuietHours } from '@/lib/tcpa/quiet-hours';

export class OptedOutError extends Error {
  constructor(phone: string) {
    super(`Recipient ${phone} has opted out of SMS`);
    this.name = 'OptedOutError';
  }
}

export class QuietHoursError extends Error {
  constructor(timezone: string) {
    super(`Send blocked by quiet hours in ${timezone}`);
    this.name = 'QuietHoursError';
  }
}

export type SendSmsInput = {
  propertyId: string;
  propertyTimezone: string;
  from: string;               // property's Twilio phone (E.164)
  to: string;                 // prospect phone (E.164)
  body: string;
  directReply: boolean;       // true = within 15 min of an inbound, bypasses quiet hours
};

/**
 * Send an SMS via Twilio, guarded by TCPA opt-out and quiet-hours checks.
 *
 * Throws OptedOutError or QuietHoursError without calling Twilio when the
 * send is blocked. Callers should catch these and log — the call site
 * decides whether to surface the failure to the user.
 */
export async function sendSms(input: SendSmsInput): Promise<void> {
  if (await isOptedOut(input.propertyId, input.to)) {
    throw new OptedOutError(input.to);
  }

  if (!input.directReply && isWithinQuietHours(input.propertyTimezone)) {
    throw new QuietHoursError(input.propertyTimezone);
  }

  const client = getTwilioClient();
  await client.messages.create({
    from: input.from,
    to: input.to,
    body: input.body,
  });
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
pnpm --filter @omnilease/web test src/lib/twilio/__tests__/send.test.ts 2>&1 | tail -20
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/twilio/send.ts apps/web/src/lib/twilio/__tests__/send.test.ts
git commit -m "feat(web): sendSms with tcpa opt-out and quiet-hours guards"
```

---

### Task 7: Write the SMS webhook route handler

**Files:**
- Create: `apps/web/src/app/api/webhooks/twilio/sms/route.ts`

This is the biggest task in Plan 1b. The handler orchestrates: verify signature → property lookup → opt-out check → STOP handling → first-contact consent → insert inbound message → ACK Twilio → delegate to engine via `after()` → on engine completion, send the assistant reply via `sendSms`.

- [ ] **Step 1: Create the route handler**

Create `apps/web/src/app/api/webhooks/twilio/sms/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { after } from 'next/server';
import { db, eq, and, desc } from '@omnilease/db';
import {
  properties,
  conversations,
  messages,
  consentRecords,
} from '@omnilease/db';
import { verifyTwilioSignature } from '@/lib/twilio/verify';
import { sendSms, OptedOutError, QuietHoursError } from '@/lib/twilio/send';
import { isOptedOut, isStopKeyword, markOptedOut } from '@/lib/tcpa/opt-outs';
import { isDirectReplyWindow } from '@/lib/tcpa/quiet-hours';
import { classifyIntent } from '@/lib/conversation/intent';
import { processConversation } from '@/lib/conversation/engine';

// Route needs up to 5 minutes for the LLM roundtrip + outbound send to happen
// via after(). Twilio gets an immediate ACK — after() work runs independently.
export const maxDuration = 300;

// Text shown to prospects on their very first contact. This is the TCPA
// consent disclosure — it must be delivered before any outbound reply.
const FIRST_CONTACT_DISCLOSURE =
  'Reply STOP to opt out. Msg & data rates may apply.';

const STOP_ACK = 'You have been unsubscribed. No further messages will be sent.';

export async function POST(req: NextRequest): Promise<Response> {
  // 1. Parse x-www-form-urlencoded body (Twilio's format).
  const rawBody = await req.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(rawBody)) {
    params[k] = v;
  }

  // 2. Reconstruct the full URL the signature was computed against.
  //    Twilio uses the exact URL it POSTed to, including scheme/host/path/query.
  const appUrl = process.env.APP_URL ?? '';
  const url = appUrl.replace(/\/$/, '') + '/api/webhooks/twilio/sms';

  // 3. Verify the signature.
  const signature = req.headers.get('x-twilio-signature') ?? '';
  if (!verifyTwilioSignature({ signature, url, params })) {
    return new Response('Forbidden', { status: 403 });
  }

  const from = params.From ?? '';
  const to = params.To ?? '';
  const body = (params.Body ?? '').trim();
  if (!from || !to || !body) {
    return twimlOk();
  }

  // 4. Resolve the property by the Twilio number that was dialed.
  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.twilioPhone, to))
    .limit(1);

  if (!property) {
    // Unknown number — silently ACK so Twilio stops retrying.
    return twimlOk();
  }

  // 5. Opt-out check: already opted out → silent no-op.
  if (await isOptedOut(property.id, from)) {
    return twimlOk();
  }

  // 6. STOP keyword: record opt-out, send one-time ack, done.
  if (isStopKeyword(body)) {
    await markOptedOut(property.id, from, body.trim().toUpperCase() as 'STOP');
    // Ack outside of quiet-hours enforcement — TCPA permits a single opt-out
    // confirmation. We bypass by passing directReply:true.
    if (property.twilioPhone) {
      try {
        await sendSms({
          propertyId: property.id,
          propertyTimezone: property.timezone,
          from: property.twilioPhone,
          to: from,
          body: STOP_ACK,
          directReply: true,
        });
      } catch {
        // Ignore send failures on the ack — the DB opt-out is what matters.
      }
    }
    return twimlOk();
  }

  // 7. Get or create conversation.
  let conversationId: string;
  {
    const [existing] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.propertyId, property.id),
          eq(conversations.externalId, from),
          eq(conversations.channel, 'sms'),
        ),
      )
      .limit(1);

    if (existing) {
      conversationId = existing.id;
    } else {
      const [created] = await db
        .insert(conversations)
        .values({
          propertyId: property.id,
          channel: 'sms',
          externalId: from,
          prospectPhone: from,
          status: 'active',
        })
        .returning({ id: conversations.id });
      conversationId = created.id;

      // First contact → record consent disclosure snapshot.
      await db
        .insert(consentRecords)
        .values({
          propertyId: property.id,
          phone: from,
          source: 'first_contact',
          consentText: FIRST_CONTACT_DISCLOSURE,
        })
        .onConflictDoNothing({
          target: [consentRecords.propertyId, consentRecords.phone],
        });
    }
  }

  // 8. Insert the inbound message row with detected intent in metadata.
  const intent = classifyIntent(body);
  await db.insert(messages).values({
    conversationId,
    role: 'user',
    authorType: 'prospect',
    content: body,
    channel: 'sms',
    metadata: { intent },
  });

  // 9. ACK Twilio immediately with empty TwiML.
  // 10. Then process the conversation in the background and send the reply.
  after(async () => {
    try {
      const result = await processConversation({
        conversationId,
        propertyId: property.id,
        inboundText: body,
      });

      // Find the last inbound to know if we're in the direct-reply window
      // (which is essentially always right after this webhook runs — the
      // most recent inbound is the one we just inserted).
      const [lastInbound] = await db
        .select({ createdAt: messages.createdAt })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversationId),
            eq(messages.role, 'user'),
          ),
        )
        .orderBy(desc(messages.createdAt))
        .limit(1);

      const directReply = isDirectReplyWindow(lastInbound?.createdAt ?? null);

      if (property.twilioPhone) {
        await sendSms({
          propertyId: property.id,
          propertyTimezone: property.timezone,
          from: property.twilioPhone,
          to: from,
          body: result.assistantText,
          directReply,
        });
      }
    } catch (err) {
      if (err instanceof OptedOutError || err instanceof QuietHoursError) {
        // Expected — log and swallow.
        console.warn('[twilio/sms] send blocked:', err.message);
        return;
      }
      console.error('[twilio/sms] after() failed:', err);
    }
  });

  return twimlOk();
}

function twimlOk(): Response {
  return new Response('<Response/>', {
    status: 200,
    headers: { 'content-type': 'text/xml' },
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @omnilease/web typecheck 2>&1 | tail -30
```
Expected: clean.

**Likely issues:**
1. **`after` import** — In Next.js 16, `after` is exported from `'next/server'`. If your Next.js version has moved it, the error message will tell you where. The function signature is `after(callback)` and it defers work until after the response is sent.
2. **`desc` import** — already re-exported from `@omnilease/db` per Plan 1a's `packages/db/src/index.ts`. If missing, import from `'drizzle-orm'` instead.
3. **`consentRecords.onConflictDoNothing`** — same pattern as Task 4's `smsOptOuts`, should work identically.
4. **`maxDuration` export** — standard Next.js route segment config. Some versions want `export const runtime = 'nodejs'` too; add it if typecheck or runtime complains.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/webhooks/twilio/sms/route.ts
git commit -m "feat(web): twilio sms inbound webhook — verify, ack, delegate to engine"
```

---

### Task 8: Write the SMS status callback handler

**Files:**
- Create: `apps/web/src/app/api/webhooks/twilio/sms/status/route.ts`

This is a minimal handler that logs delivery state for now. Plan 1c's dashboard analytics will surface it; Plan 1b just captures the data.

- [ ] **Step 1: Create the route**

Create `apps/web/src/app/api/webhooks/twilio/sms/status/route.ts`:

```ts
import type { NextRequest } from 'next/server';
import { verifyTwilioSignature } from '@/lib/twilio/verify';

export async function POST(req: NextRequest): Promise<Response> {
  const rawBody = await req.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(rawBody)) {
    params[k] = v;
  }

  const appUrl = process.env.APP_URL ?? '';
  const url = appUrl.replace(/\/$/, '') + '/api/webhooks/twilio/sms/status';

  const signature = req.headers.get('x-twilio-signature') ?? '';
  if (!verifyTwilioSignature({ signature, url, params })) {
    return new Response('Forbidden', { status: 403 });
  }

  // MessageSid, MessageStatus (queued|sent|delivered|failed|undelivered), ErrorCode
  console.log('[twilio/sms/status]', {
    sid: params.MessageSid,
    status: params.MessageStatus,
    errorCode: params.ErrorCode,
  });

  return new Response('', { status: 200 });
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @omnilease/web typecheck
git add apps/web/src/app/api/webhooks/twilio/sms/status/route.ts
git commit -m "feat(web): twilio sms delivery status webhook handler"
```

---

### Task 9: Integration test — SMS webhook end-to-end

**Files:**
- Create: `apps/web/src/app/api/webhooks/twilio/sms/__tests__/route.int.test.ts`

- [ ] **Step 1: Write the test**

Create `apps/web/src/app/api/webhooks/twilio/sms/__tests__/route.int.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';

// Hoisted mocks — must be set up before the route handler imports.
const { generateTextMock, sendSmsMock, afterSpy } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  sendSmsMock: vi.fn().mockResolvedValue(undefined),
  afterSpy: vi.fn(),
}));

// Mock AI SDK — we only care that processConversation runs, not what the LLM says.
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return { ...actual, generateText: generateTextMock };
});

// Mock Resend so escalation emails don't try to hit a real API.
vi.mock('@/lib/email/resend', () => ({
  sendEscalationEmail: vi.fn().mockResolvedValue(undefined),
}));

// Mock the Twilio send boundary — we're testing the webhook handler, not
// Twilio's network path.
vi.mock('@/lib/twilio/send', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/twilio/send')>('@/lib/twilio/send');
  return {
    ...actual,
    sendSms: sendSmsMock,
  };
});

// Make Next.js after() run synchronously in tests — we want to observe its
// side effects in the same tick as the response.
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return {
    ...actual,
    after: (cb: () => Promise<void>) => {
      afterSpy();
      return cb();
    },
  };
});

import { db, eq } from '@omnilease/db';
import {
  organizations,
  properties,
  conversations,
  messages,
  smsOptOuts,
  consentRecords,
} from '@omnilease/db';
import { POST } from '../route';

const TEST_PREFIX = 'sms-int-';
const AUTH_TOKEN = 'fake_auth_token_for_tests';
const APP_URL = 'https://app.example.com';
const TWILIO_FROM = '+15557654321';

function signRequest(url: string, params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  const data = url + sortedKeys.map((k) => `${k}${params[k]}`).join('');
  return createHmac('sha1', AUTH_TOKEN).update(data).digest('base64');
}

async function seedProperty() {
  const [org] = await db
    .insert(organizations)
    .values({
      name: `${TEST_PREFIX}org`,
      slug: `${TEST_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      plan: 'starter',
    })
    .returning();
  const [prop] = await db
    .insert(properties)
    .values({
      orgId: org.id,
      name: 'Sunset Ridge',
      timezone: 'America/Chicago',
      twilioPhone: TWILIO_FROM,
      escalationEmail: 'mgr@example.com',
    })
    .returning();
  return { orgId: org.id, propertyId: prop.id };
}

async function cleanup(orgId: string) {
  await db.delete(organizations).where(eq(organizations.id, orgId));
}

function buildRequest(body: Record<string, string>): Request {
  const form = new URLSearchParams(body).toString();
  const url = APP_URL + '/api/webhooks/twilio/sms';
  const signature = signRequest(url, body);
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature,
    },
    body: form,
  });
}

describe('POST /api/webhooks/twilio/sms (integration)', () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    sendSmsMock.mockReset();
    sendSmsMock.mockResolvedValue(undefined);
    afterSpy.mockReset();
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
    process.env.APP_URL = APP_URL;
  });

  it('rejects unsigned requests with 403', async () => {
    const form = new URLSearchParams({
      From: '+15551111111',
      To: TWILIO_FROM,
      Body: 'hello',
    }).toString();
    const res = await POST(
      new Request(APP_URL + '/api/webhooks/twilio/sms', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
      }) as any,
    );
    expect(res.status).toBe(403);
  });

  it('happy path: signs in, persists inbound, acks TwiML, triggers engine + send', async () => {
    const { orgId, propertyId } = await seedProperty();
    try {
      generateTextMock.mockResolvedValue({
        text: 'Yes — we welcome dogs up to 75 lbs.',
        steps: [],
      });

      const req = buildRequest({
        From: '+15551111111',
        To: TWILIO_FROM,
        Body: 'Do you allow dogs?',
        MessageSid: 'SM_test_1',
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('<Response');

      // Conversation + inbound message persisted
      const convs = await db
        .select()
        .from(conversations)
        .where(eq(conversations.propertyId, propertyId));
      expect(convs.length).toBe(1);
      expect(convs[0].channel).toBe('sms');
      expect(convs[0].externalId).toBe('+15551111111');

      const msgs = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, convs[0].id));
      expect(msgs.length).toBeGreaterThanOrEqual(1); // at least the inbound; engine may have added assistant too
      const inbound = msgs.find((m) => m.authorType === 'prospect');
      expect(inbound).toBeTruthy();
      expect((inbound?.metadata as { intent?: string })?.intent).toBe('pets');

      // Consent record for first contact
      const consent = await db
        .select()
        .from(consentRecords)
        .where(eq(consentRecords.propertyId, propertyId));
      expect(consent.length).toBe(1);
      expect(consent[0].source).toBe('first_contact');

      // after() ran and called sendSms
      expect(afterSpy).toHaveBeenCalled();
      expect(sendSmsMock).toHaveBeenCalledTimes(1);
      expect(sendSmsMock.mock.calls[0][0].body).toContain('75 lbs');
      expect(sendSmsMock.mock.calls[0][0].to).toBe('+15551111111');
    } finally {
      await cleanup(orgId);
    }
  });

  it('STOP keyword: records opt-out, sends ack, does not hit engine', async () => {
    const { orgId, propertyId } = await seedProperty();
    try {
      const req = buildRequest({
        From: '+15552222222',
        To: TWILIO_FROM,
        Body: 'STOP',
        MessageSid: 'SM_test_stop',
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);

      const optOuts = await db
        .select()
        .from(smsOptOuts)
        .where(eq(smsOptOuts.propertyId, propertyId));
      expect(optOuts.length).toBe(1);
      expect(optOuts[0].phone).toBe('+15552222222');
      expect(optOuts[0].keyword).toBe('STOP');

      // Ack was sent (directReply: true)
      expect(sendSmsMock).toHaveBeenCalledTimes(1);
      expect(sendSmsMock.mock.calls[0][0].body).toMatch(/unsubscribed/i);

      // Engine was NOT called — generateText untouched
      expect(generateTextMock).not.toHaveBeenCalled();
    } finally {
      await cleanup(orgId);
    }
  });

  it('already-opted-out recipient: silent ack, no engine, no send', async () => {
    const { orgId, propertyId } = await seedProperty();
    try {
      // Pre-seed opt-out
      await db.insert(smsOptOuts).values({
        propertyId,
        phone: '+15553333333',
        keyword: 'STOP',
      });

      const req = buildRequest({
        From: '+15553333333',
        To: TWILIO_FROM,
        Body: 'hey can you help?',
        MessageSid: 'SM_test_optedout',
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);

      const convs = await db
        .select()
        .from(conversations)
        .where(eq(conversations.propertyId, propertyId));
      expect(convs.length).toBe(0);
      expect(sendSmsMock).not.toHaveBeenCalled();
      expect(generateTextMock).not.toHaveBeenCalled();
    } finally {
      await cleanup(orgId);
    }
  });

  it('unknown To number: silent ack, no conversation', async () => {
    const req = buildRequest({
      From: '+15554444444',
      To: '+15559999999', // not in any property
      Body: 'hi',
      MessageSid: 'SM_test_unknown',
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(sendSmsMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm --filter @omnilease/web test src/app/api/webhooks/twilio/sms/__tests__/route.int.test.ts 2>&1 | tail -40
```
Expected: PASS (5 tests).

**Likely issues:**

1. **`next/server` mock doesn't intercept `after()`** — if `afterSpy` never fires, the mock structure for `next/server` is wrong. Fix by adjusting the module mock to correctly export `after`.

2. **`Request` type cast** — Next.js 16's `POST` handler expects `NextRequest`, not plain `Request`. The `as any` in the test is a shortcut; if typecheck complains, use `as NextRequest` from `'next/server'`.

3. **Vitest include glob** — route-level tests may not be picked up unless `vitest.config.ts` has `**/*.int.test.ts` in `include`. Plan 1a's Task 16 already added this. Verify by checking `apps/web/vitest.config.ts`.

4. **Engine insertion of assistant row** — the happy-path test checks `msgs.length >= 1`, not exactly 2, because the `after()` work may or may not have finished persisting the assistant row by the time the test awaits. If you want to assert exactly 2, add a small delay or `await`. The safer assertion is the `sendSmsMock` call — that fires only after the engine completed.

Iterate minor fixes. Don't weaken assertions about opt-out / STOP / unknown-number paths.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/webhooks/twilio/sms/__tests__/route.int.test.ts
git commit -m "test(web): integration test for twilio sms webhook — happy/stop/opted/unknown paths"
```

---

### Task 10: Add `streamConversationForWidget` to `engine.ts`

**Files:**
- Modify: `apps/web/src/lib/conversation/engine.ts`

The widget path needs streaming. We add a sibling function that mirrors `processConversation` but uses `streamText` + `toUIMessageStreamResponse`. The existing `processConversation` stays untouched so Plan 1a's integration test keeps passing.

- [ ] **Step 1: Read the current engine.ts**

Read `apps/web/src/lib/conversation/engine.ts` to remember the shape of `processConversation`.

- [ ] **Step 2: Add the streaming variant**

Append this code to `engine.ts` (after the existing `processConversation` function, before the end of the file):

```ts
// ---------------------------------------------------------------------------
// Streaming variant for the webchat widget.
// ---------------------------------------------------------------------------

import { streamText } from 'ai';

export type StreamConversationInput = {
  conversationId: string;
  propertyId: string;
  inboundText: string;
};

/**
 * Widget path — same system prompt / tools / history as the non-streaming
 * path, but returns a streaming Response via AI SDK's `toUIMessageStreamResponse`.
 * Side effects (escalation, safety filtering, persistence) happen in the
 * `onFinish` callback after the final text is produced.
 *
 * Note: the streaming path intentionally re-uses the same helpers as
 * `processConversation`. If the two diverge meaningfully, factor out a
 * private `_buildContext` helper. For now the small duplication is clearer
 * than premature abstraction.
 */
export async function streamConversationForWidget(
  input: StreamConversationInput,
): Promise<Response> {
  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, input.propertyId))
    .limit(1);
  if (!property) throw new Error(`property not found: ${input.propertyId}`);

  const units = await db
    .select()
    .from(unitTypesTable)
    .where(eq(unitTypesTable.propertyId, input.propertyId));

  const knowledge = await db
    .select({
      category: propertyKnowledgeTable.category,
      content: propertyKnowledgeTable.content,
    })
    .from(propertyKnowledgeTable)
    .where(eq(propertyKnowledgeTable.propertyId, input.propertyId));

  const intent = classifyIntent(input.inboundText);

  const systemPrompt = buildSystemPrompt({
    property: {
      name: property.name,
      address: property.address,
      city: property.city,
      state: property.state,
      timezone: property.timezone,
      officeHours: property.officeHours ?? null,
      welcomeMessage: property.welcomeMessage,
    },
    unitTypes: units.map((u) => ({
      name: u.name,
      bedrooms: u.bedrooms,
      bathrooms: u.bathrooms,
      sqftMin: u.sqftMin,
      sqftMax: u.sqftMax,
      priceMin: u.priceMin,
      priceMax: u.priceMax,
      availableCount: u.availableCount,
      deposit: u.deposit,
      description: u.description,
      isActive: u.isActive,
    })),
    knowledge: knowledge.map((k) => ({ category: k.category, content: k.content })),
  });

  const tools = buildConversationTools({
    conversationId: input.conversationId,
    propertyId: input.propertyId,
  });

  const history = await loadHistory(input.conversationId, 20);
  const historyWithNew: typeof history = [
    ...history,
    { role: 'user', content: input.inboundText },
  ];

  const result = streamText({
    model: MODEL,
    system: `${systemPrompt}\n\n[Detected intent: ${intent}]`,
    messages: historyWithNew.map((t) => ({ role: t.role, content: t.content })),
    tools,
    stopWhen: stepCountIs(4),
    onFinish: async ({ text, steps }) => {
      // Fan out escalation side-effects (same as processConversation).
      let escalated = false;
      for (const step of steps) {
        for (const call of step.toolCalls) {
          if (call.toolName === 'escalate_to_human') {
            const args = call.input as {
              reason: string;
              priority: 'low' | 'normal' | 'high' | 'urgent';
            };
            await escalateConversation({
              conversationId: input.conversationId,
              propertyId: input.propertyId,
              reason: args.reason,
              priority: args.priority,
            });
            escalated = true;
          }
        }
      }

      const safety = applySafetyFilter(text);
      if (!escalated && safety.autoEscalate) {
        await escalateConversation({
          conversationId: input.conversationId,
          propertyId: input.propertyId,
          reason: `Low confidence response (score ${safety.confidence.toFixed(2)})`,
          priority: 'normal',
        });
      }

      const allToolCalls = steps.flatMap((s) => s.toolCalls);
      await db.insert(messagesTable).values({
        conversationId: input.conversationId,
        role: 'assistant',
        authorType: 'ai',
        content: safety.text,
        channel: 'webchat',
        confidenceScore: String(safety.confidence),
        toolCalls: allToolCalls.length > 0 ? allToolCalls : null,
        metadata: safety.flagged ? { safety_flag: true } : null,
      });
    },
  });

  return result.toUIMessageStreamResponse();
}
```

- [ ] **Step 3: Also add `streamText` to the top-of-file import**

At the top of `engine.ts`, update:
```ts
import { generateText, stepCountIs } from 'ai';
```
to:
```ts
import { generateText, streamText, stepCountIs } from 'ai';
```

Delete the later `import { streamText } from 'ai';` line you added in Step 2 — consolidate all imports at the top.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @omnilease/web typecheck 2>&1 | tail -30
```

**Likely issues:**
- `onFinish` argument shape in AI SDK v6 is `{ text, finishReason, usage, response, steps, ... }`. Access fields defensively if types don't match; the engine only needs `text` and `steps`.
- The streaming `safety.text` is ONLY applied in `onFinish` for persistence — the tokens the browser receives are the raw LLM output, not safety-filtered. That's a known trade-off: fair-housing phrases could briefly appear in the widget before the final persisted text is sanitized. Accept for Phase 1 (fair-housing violations are rare, the stream is short, Plan 1c's audit queue will surface them).
- `result.toUIMessageStreamResponse()` is the correct AI SDK v6 method name.

- [ ] **Step 5: Run Plan 1a's engine test to confirm nothing regressed**

```bash
pnpm --filter @omnilease/web test src/lib/conversation/__tests__/engine.int.test.ts 2>&1 | tail -20
```
Expected: still PASS (3 tests). If any regress, the streaming variant's added imports broke something — investigate.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/conversation/engine.ts
git commit -m "feat(web): add streamConversationForWidget for widget SSE path"
```

---

### Task 11: Write `/api/widget/session/route.ts`

**Files:**
- Create: `apps/web/src/app/api/widget/session/route.ts`

Minimal session init — the widget POSTs `{ widgetId }`, gets back a session ID. For Phase 1 we generate a random UUID and trust the client to preserve it in localStorage. Real Realtime-auth tokens for Plan 1c's human takeover path are out of scope here.

- [ ] **Step 1: Create the route**

Create `apps/web/src/app/api/widget/session/route.ts`:

```ts
import { type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { db, eq } from '@omnilease/db';
import { properties } from '@omnilease/db';

export async function POST(req: NextRequest): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const widgetId = typeof body?.widgetId === 'string' ? body.widgetId : null;
  if (!widgetId) {
    return Response.json({ error: 'widgetId required' }, { status: 400 });
  }

  const [property] = await db
    .select({
      id: properties.id,
      name: properties.name,
      brandColor: properties.brandColor,
      welcomeMessage: properties.welcomeMessage,
    })
    .from(properties)
    .where(eq(properties.webchatWidgetId, widgetId))
    .limit(1);

  if (!property) {
    return Response.json({ error: 'unknown widgetId' }, { status: 404 });
  }

  // Generate a fresh session UUID. The client stores it in localStorage and
  // echoes it on every subsequent /api/widget/chat request.
  const sessionId = randomUUID();

  return Response.json({
    sessionId,
    property: {
      name: property.name,
      brandColor: property.brandColor ?? '#111827',
      welcomeMessage: property.welcomeMessage ?? `Hi there — how can I help you today?`,
    },
  });
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @omnilease/web typecheck
git add apps/web/src/app/api/widget/session/route.ts
git commit -m "feat(web): widget session init route"
```

---

### Task 12: Write `/api/widget/chat/route.ts`

**Files:**
- Create: `apps/web/src/app/api/widget/chat/route.ts`

- [ ] **Step 1: Create the route**

Create `apps/web/src/app/api/widget/chat/route.ts`:

```ts
import { type NextRequest } from 'next/server';
import { db, eq, and } from '@omnilease/db';
import { properties, conversations, messages } from '@omnilease/db';
import { streamConversationForWidget } from '@/lib/conversation/engine';
import { classifyIntent } from '@/lib/conversation/intent';

export const maxDuration = 300;

export async function POST(req: NextRequest): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const widgetId = typeof body?.widgetId === 'string' ? body.widgetId : null;
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : null;
  const text = typeof body?.text === 'string' ? body.text.trim() : null;

  if (!widgetId || !sessionId || !text) {
    return new Response('widgetId, sessionId, and text required', { status: 400 });
  }

  // Resolve property
  const [property] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.webchatWidgetId, widgetId))
    .limit(1);
  if (!property) return new Response('unknown widget', { status: 404 });

  // Get or create conversation keyed by session
  let conversationId: string;
  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.propertyId, property.id),
        eq(conversations.externalId, sessionId),
        eq(conversations.channel, 'webchat'),
      ),
    )
    .limit(1);

  if (existing) {
    conversationId = existing.id;
  } else {
    const [created] = await db
      .insert(conversations)
      .values({
        propertyId: property.id,
        channel: 'webchat',
        externalId: sessionId,
        status: 'active',
      })
      .returning({ id: conversations.id });
    conversationId = created.id;
  }

  // Persist the inbound prospect message with detected intent
  await db.insert(messages).values({
    conversationId,
    role: 'user',
    authorType: 'prospect',
    content: text,
    channel: 'webchat',
    metadata: { intent: classifyIntent(text) },
  });

  // Stream the assistant reply
  return await streamConversationForWidget({
    conversationId,
    propertyId: property.id,
    inboundText: text,
  });
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @omnilease/web typecheck
git add apps/web/src/app/api/widget/chat/route.ts
git commit -m "feat(web): widget chat route — SSE stream via streamConversationForWidget"
```

---

### Task 13: Write `apps/web/public/widget.js`

**Files:**
- Create: `apps/web/public/widget.js`

A single self-contained vanilla JS module. Embedded via `<script src="/widget.js" data-widget-id="..." defer></script>`. No build step.

- [ ] **Step 1: Create the widget**

Create `apps/web/public/widget.js`:

```js
/* Omnilease embeddable chat widget (Phase 1b, vanilla JS).
 *
 * Usage:
 *   <script src="https://your-app.vercel.app/widget.js" data-widget-id="abc123" defer></script>
 *
 * Responsibilities:
 *   - Render a floating bubble + panel bottom-right
 *   - Init a session via POST /api/widget/session
 *   - Send user messages via POST /api/widget/chat, stream SSE tokens back
 *   - Preserve sessionId in localStorage for conversation continuity
 */
(() => {
  const script = document.currentScript;
  if (!script) return;
  const widgetId = script.getAttribute('data-widget-id');
  if (!widgetId) return;

  // Derive the app origin from the script's own src.
  const origin = new URL(script.src).origin;

  const SESSION_KEY = `omnilease:session:${widgetId}`;

  let sessionId = localStorage.getItem(SESSION_KEY);
  let property = { name: 'Chat', brandColor: '#111827', welcomeMessage: 'Hi there!' };
  let messagesEl = null;
  let inputEl = null;
  let panelOpen = false;

  async function initSession() {
    const res = await fetch(origin + '/api/widget/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ widgetId }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!sessionId) {
      sessionId = data.sessionId;
      localStorage.setItem(SESSION_KEY, sessionId);
    }
    property = data.property ?? property;
    applyBranding();
  }

  function applyBranding() {
    const bubble = document.getElementById('omnilease-bubble');
    if (bubble) bubble.style.background = property.brandColor;
    const header = document.getElementById('omnilease-header');
    if (header) {
      header.style.background = property.brandColor;
      header.textContent = property.name;
    }
  }

  function render() {
    const root = document.createElement('div');
    root.id = 'omnilease-root';
    root.innerHTML = `
      <button id="omnilease-bubble" aria-label="Open chat" style="
        position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;
        background:#111827;color:white;border:none;cursor:pointer;z-index:2147483647;
        box-shadow:0 4px 12px rgba(0,0,0,0.2);font-size:24px;">
        💬
      </button>
      <div id="omnilease-panel" style="
        position:fixed;bottom:90px;right:20px;width:360px;height:520px;background:white;
        border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.3);z-index:2147483647;
        display:none;flex-direction:column;font-family:system-ui,-apple-system,sans-serif;">
        <div id="omnilease-header" style="
          padding:16px;background:#111827;color:white;border-radius:12px 12px 0 0;
          font-weight:600;">Chat</div>
        <div id="omnilease-messages" style="
          flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;
          font-size:14px;color:#111827;"></div>
        <form id="omnilease-form" style="
          border-top:1px solid #e5e7eb;padding:12px;display:flex;gap:8px;">
          <input id="omnilease-input" type="text" placeholder="Type a message..." style="
            flex:1;padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;
            font-size:14px;outline:none;"/>
          <button type="submit" style="
            padding:8px 16px;background:#111827;color:white;border:none;border-radius:8px;
            cursor:pointer;font-size:14px;">Send</button>
        </form>
      </div>
    `;
    document.body.appendChild(root);
    messagesEl = document.getElementById('omnilease-messages');
    inputEl = document.getElementById('omnilease-input');
    const bubble = document.getElementById('omnilease-bubble');
    const panel = document.getElementById('omnilease-panel');
    const form = document.getElementById('omnilease-form');

    bubble.addEventListener('click', () => {
      panelOpen = !panelOpen;
      panel.style.display = panelOpen ? 'flex' : 'none';
      if (panelOpen && messagesEl.childElementCount === 0) {
        addBubble('assistant', property.welcomeMessage);
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = inputEl.value.trim();
      if (!text || !sessionId) return;
      inputEl.value = '';
      addBubble('user', text);
      const replyEl = addBubble('assistant', '');
      await streamReply(text, replyEl);
    });
  }

  function addBubble(role, text) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.alignSelf = role === 'user' ? 'flex-end' : 'flex-start';
    el.style.maxWidth = '80%';
    el.style.padding = '8px 12px';
    el.style.borderRadius = '12px';
    el.style.background = role === 'user' ? '#111827' : '#f3f4f6';
    el.style.color = role === 'user' ? 'white' : '#111827';
    el.style.wordWrap = 'break-word';
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  async function streamReply(text, replyEl) {
    let res;
    try {
      res = await fetch(origin + '/api/widget/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ widgetId, sessionId, text }),
      });
    } catch (err) {
      replyEl.textContent = 'Sorry, the chat is offline right now.';
      return;
    }
    if (!res.ok || !res.body) {
      replyEl.textContent = 'Sorry, the chat is offline right now.';
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // AI SDK toUIMessageStreamResponse() uses a line-delimited protocol with
    // prefixed chunks. For Phase 1 we concatenate every text-delta frame naively.
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line) continue;
        try {
          const frame = JSON.parse(line.replace(/^data: ?/, ''));
          if (frame.type === 'text-delta' && typeof frame.delta === 'string') {
            replyEl.textContent += frame.delta;
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
        } catch {
          // Ignore non-JSON frames
        }
      }
    }
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      render();
      initSession();
    });
  } else {
    render();
    initSession();
  }
})();
```

- [ ] **Step 2: Manually verify the file is syntactically valid JS**

```bash
node --check apps/web/public/widget.js
```
Expected: no output (valid).

- [ ] **Step 3: Commit**

```bash
git add apps/web/public/widget.js
git commit -m "feat(web): embeddable vanilla js chat widget for webchat channel"
```

---

### Task 14: Integration test — widget chat route

**Files:**
- Create: `apps/web/src/app/api/widget/chat/__tests__/route.int.test.ts`

- [ ] **Step 1: Write the test**

Create `apps/web/src/app/api/widget/chat/__tests__/route.int.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoisted mocks
const { streamTextMock } = vi.hoisted(() => ({
  streamTextMock: vi.fn(),
}));

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return { ...actual, streamText: streamTextMock };
});

vi.mock('@/lib/email/resend', () => ({
  sendEscalationEmail: vi.fn().mockResolvedValue(undefined),
}));

import { db, eq } from '@omnilease/db';
import {
  organizations,
  properties,
  conversations,
  messages,
} from '@omnilease/db';
import { POST } from '../route';

const TEST_PREFIX = 'widget-int-';

async function seedProperty() {
  const [org] = await db
    .insert(organizations)
    .values({
      name: `${TEST_PREFIX}org`,
      slug: `${TEST_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      plan: 'starter',
    })
    .returning();
  const widgetId = `wdg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const [prop] = await db
    .insert(properties)
    .values({
      orgId: org.id,
      name: 'Sunset Ridge',
      timezone: 'America/Chicago',
      webchatWidgetId: widgetId,
    })
    .returning();
  return { orgId: org.id, propertyId: prop.id, widgetId };
}

async function cleanup(orgId: string) {
  await db.delete(organizations).where(eq(organizations.id, orgId));
}

// Fake streamText return — provides a .toUIMessageStreamResponse() that yields
// a minimal SSE body. Also invokes onFinish synchronously so assistant
// persistence happens before the test awaits cleanup.
function fakeStreamResult(text: string) {
  return {
    toUIMessageStreamResponse: () =>
      new Response(
        `data: {"type":"text-delta","delta":"${text}"}\n\ndata: [DONE]\n\n`,
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      ),
  };
}

describe('POST /api/widget/chat (integration)', () => {
  beforeEach(() => {
    streamTextMock.mockReset();
  });

  it('rejects missing fields with 400', async () => {
    const req = new Request('https://app.example.com/api/widget/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ widgetId: 'x', sessionId: 'y' }), // missing text
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('rejects unknown widgetId with 404', async () => {
    streamTextMock.mockImplementation(() => fakeStreamResult('hi'));
    const req = new Request('https://app.example.com/api/widget/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        widgetId: 'unknown',
        sessionId: 'sess_1',
        text: 'hello',
      }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(404);
  });

  it('creates a conversation, persists inbound, returns a streaming response', async () => {
    const { orgId, propertyId, widgetId } = await seedProperty();
    try {
      let capturedOnFinish: ((arg: unknown) => void) | undefined;
      streamTextMock.mockImplementation((opts: Record<string, unknown>) => {
        capturedOnFinish = opts.onFinish as typeof capturedOnFinish;
        return fakeStreamResult('Yes we welcome dogs!');
      });

      const req = new Request('https://app.example.com/api/widget/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          widgetId,
          sessionId: 'sess_xyz',
          text: 'Do you allow dogs?',
        }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      // Invoke onFinish to simulate stream completion
      if (capturedOnFinish) {
        await capturedOnFinish({
          text: 'Yes we welcome dogs!',
          steps: [],
        });
      }

      // Conversation created
      const convs = await db
        .select()
        .from(conversations)
        .where(eq(conversations.propertyId, propertyId));
      expect(convs.length).toBe(1);
      expect(convs[0].channel).toBe('webchat');
      expect(convs[0].externalId).toBe('sess_xyz');

      // Inbound prospect message persisted with intent
      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, convs[0].id));
      const prospect = rows.find((r) => r.authorType === 'prospect');
      expect(prospect?.content).toBe('Do you allow dogs?');
      expect((prospect?.metadata as { intent?: string })?.intent).toBe('pets');

      // Assistant message persisted by onFinish
      const assistant = rows.find((r) => r.authorType === 'ai');
      expect(assistant?.content).toContain('welcome dogs');
      expect(assistant?.channel).toBe('webchat');
    } finally {
      await cleanup(orgId);
    }
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm --filter @omnilease/web test src/app/api/widget/chat/__tests__/route.int.test.ts 2>&1 | tail -40
```
Expected: PASS (3 tests).

**Likely issues:**
- The fake `streamResult` shape may not match what AI SDK v6's real `streamText` returns closely enough to satisfy the route handler's code path. If `.toUIMessageStreamResponse()` is called and the mock returns something other than a `Response`, the route handler throws. Keep the fake minimal — just enough to return a real `Response` object.
- `onFinish` may not be awaited by the test naturally; manually invoking it via `capturedOnFinish` ensures the assistant row gets written before cleanup.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/widget/chat/__tests__/route.int.test.ts
git commit -m "test(web): integration test for widget chat route"
```

---

### Task 15: Final typecheck + full test sweep + branch ready

**Files:** none

- [ ] **Step 1: Workspace typecheck**

```bash
pnpm -r typecheck 2>&1 | tail -20
```
Expected: clean.

- [ ] **Step 2: Full web test suite**

```bash
pnpm --filter @omnilease/web test 2>&1 | tail -30
```
Expected: all test files pass. Plan 1a's tests (intent, safety, system-prompt, resend, engine.int) plus Plan 1b's new ones (verify, opt-outs, quiet-hours, send, sms route.int, widget route.int). Expect ~60+ tests total.

- [ ] **Step 3: Confirm no regressions to Plan 1a**

```bash
pnpm --filter @omnilease/web test src/lib/conversation/__tests__/engine.int.test.ts 2>&1 | tail -10
```
Expected: 3 tests still pass.

- [ ] **Step 4: Verify no stray files**

```bash
git status
```
Expected: clean.

- [ ] **Step 5: Review the commit list**

```bash
git log --oneline main..HEAD
```
Expected: ~14 commits for Plan 1b (one per task, give or take).

- [ ] **Step 6: Done**

No commit needed for this task unless something needed fixup. Report the final commit SHA list and the full test count.

---

## Definition of Done

Plan 1b is complete when:

1. `twilio` is installed in `apps/web`, env vars are documented
2. `lib/twilio/{client,verify,send}.ts` exist with unit tests green
3. `lib/tcpa/{opt-outs,quiet-hours}.ts` exist with unit + integration tests green
4. `/api/webhooks/twilio/sms/route.ts` verifies signatures, handles STOP, persists inbound, ACKs TwiML, and delegates to `processConversation` via `after()`
5. `/api/webhooks/twilio/sms/status/route.ts` accepts delivery callbacks (minimal logging)
6. `/api/widget/session/route.ts` returns a session token and property branding
7. `/api/widget/chat/route.ts` persists inbound, streams via `streamConversationForWidget`
8. `apps/web/public/widget.js` exists as a single vanilla JS file and passes `node --check`
9. `engine.ts` gains `streamConversationForWidget` without breaking Plan 1a's existing `processConversation` or its integration test
10. Integration tests pass against real local Supabase for both the SMS webhook and the widget chat route
11. `pnpm -r typecheck` clean
12. Full `pnpm --filter @omnilease/web test` suite green — no regressions on Plan 1a tests

## Known deferred items (Plan 1c territory)

- Dashboard conversations list, detail view, composer (human takeover)
- Escalations queue UI
- Analytics page
- Supabase Realtime widget subscription for mid-conversation human takeover on webchat — widget currently receives only the SSE stream from its own turn; agent replies typed in the dashboard won't appear live until Plan 1c adds a Realtime channel the widget subscribes to.
- Twilio phone number purchase + webhook URL configuration in Twilio console (infra task, not code)
- Resend domain verification (infra task)
- AI Gateway enablement via `vercel link` + `vercel env pull` (infra task)
- Legal review of the system prompt before first pilot go-live
