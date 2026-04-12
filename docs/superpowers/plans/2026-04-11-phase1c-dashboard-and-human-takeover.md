# Phase 1c — Dashboard + Human Takeover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the operator-facing dashboard for the AI answering service — conversations list + live detail view, agent reply composer (human takeover), escalations queue, basic analytics, sidebar navigation — and close the webchat human-takeover loop by adding a polling endpoint the widget uses to pick up agent replies mid-conversation.

**Architecture:** Next.js 16 App Router. Server Components load data from Drizzle and stream to the client; client components handle Supabase Realtime subscriptions (dashboard side, where users are authed and RLS via `current_org_id()` applies) and the agent reply composer. Server Actions own all write paths and reuse the Plan 1b `sendSms` / Plan 1a engine helpers. The widget gains a tiny polling loop — no new RLS work, no anon JWT minting, no new Realtime channel for anonymous users. Plan 1b's streaming path is unchanged.

**Tech Stack:** Next.js 16 App Router + Server Components + Server Actions, shadcn/ui components, Tailwind CSS, `@supabase/supabase-js` Realtime client for the dashboard, Drizzle ORM queries for all data access, Vitest + real local Supabase for integration tests.

**Source spec:** `docs/superpowers/specs/2026-04-11-phase1-ai-answering-service-design.md` (sections §5.3 server actions, §6.8 human takeover, §7.1–§7.7 dashboard)

**Prior state (Plans 1a + 1b merged on main):**
- `apps/web` has `lib/conversation/*`, `lib/email/resend.ts`, `lib/twilio/{verify,client,send}.ts`, `lib/tcpa/{opt-outs,quiet-hours}.ts`
- Route handlers: `/api/webhooks/twilio/sms`, `/api/webhooks/twilio/sms/status`, `/api/widget/session`, `/api/widget/chat`
- Widget: `apps/web/public/widget.js` with session init + streaming reply parsing
- Engine exports both `processConversation` and `streamConversationForWidget`
- DB: migrations 0000-0005 applied. `messages` has `author_type` ('ai' | 'human_agent' | 'prospect') and `metadata`. `conversations.status` is `active | escalated | closed | converted`. RLS is enabled on `conversations`, `messages`, `escalations`, all scoped by `properties.org_id = current_org_id()`
- Supabase Realtime publication includes `conversations`, `messages`, `escalations`
- Auth: `apps/web/src/lib/auth.ts` exports `requireOrg()` returning `AuthContext` with `userId/authUserId/email/orgId/orgSlug/role` where `role: Role` is `admin | manager | agent`
- Role helpers in `@omnilease/shared`: `canEditProperty`, `canReplyToConversation`, `canManageOrg`
- Test suite: 79 tests passing across 12 files. Vitest setup loads `.env.test.local` via `apps/web/vitest.setup.ts`
- Dashboard shell exists at `apps/web/src/app/(dashboard)/layout.tsx` with sidebar + top bar components at `apps/web/src/components/dashboard/{sidebar,top-bar}.tsx`
- Properties CRUD + knowledge base editor already built under `(dashboard)/properties/`

**Non-goals for this plan:** No tour scheduling, no email channel, no follow-up sequences, no multi-property onboarding wizard, no conversion funnel analytics, no Slack/SMS notifications (escalation email only per Plan 1a brainstorm Q5). No dashboard-side feature flags. No v0-generated components — hand-written shadcn primitives to match existing style.

---

## File Structure

```
apps/web/
├── public/
│   └── widget.js                                 # MODIFY — add polling loop
│
└── src/
    ├── app/
    │   ├── api/
    │   │   └── widget/
    │   │       └── poll/
    │   │           └── route.ts                  # NEW — widget poll endpoint
    │   │
    │   └── (dashboard)/
    │       ├── conversations/
    │       │   ├── page.tsx                      # NEW — list (server component)
    │       │   ├── actions.ts                    # NEW — server actions
    │       │   └── [id]/
    │       │       ├── page.tsx                  # NEW — detail (server component)
    │       │       └── composer.tsx              # NEW — client composer
    │       ├── escalations/
    │       │   ├── page.tsx                      # NEW — queue
    │       │   └── actions.ts                    # NEW — resolveEscalation
    │       └── analytics/
    │           └── page.tsx                      # NEW — cards + charts
    │
    ├── components/
    │   ├── conversations/
    │   │   ├── message-list.tsx                  # NEW — server component (initial render)
    │   │   └── live-message-list.tsx             # NEW — client, realtime subscribe
    │   └── dashboard/
    │       └── sidebar.tsx                       # MODIFY — add nav items
    │
    └── lib/
        ├── realtime/
        │   └── supabase-subscribe.ts             # NEW — useLiveMessages hook
        └── supabase/
            └── browser-client.ts                 # verify exists, create if missing
```

### Responsibility boundaries

- **Server Components read, Server Actions write.** Every mutation goes through `conversations/actions.ts` or `escalations/actions.ts` — never direct DB access from client components.
- **`requireOrg()` guards every server component page and every server action.** No route in `(dashboard)/` is accessible without an org.
- **Client Realtime subscription lives only in `live-message-list.tsx`.** It imports from `lib/realtime/supabase-subscribe.ts` which wraps the browser Supabase client. No server code imports from here.
- **`sendAgentReply` is the only server action that talks to `sendSms`.** It reuses Plan 1b's `lib/twilio/send.ts` exactly — no parallel outbound path.
- **Widget polling is one-way: prospect → server via POST as usual, new messages → prospect via GET polling.** No new RLS policies, no anon JWT minting.
- **Analytics queries are raw Drizzle — no view, no cache layer.** Phase 1 volume is low; optimize only if a query actually becomes slow.

---

## Tasks

### Task 1: Add Conversations, Escalations, Analytics to the sidebar

**Files:**
- Modify: `apps/web/src/components/dashboard/sidebar.tsx`

- [ ] **Step 1: Read the current sidebar**

Read `apps/web/src/components/dashboard/sidebar.tsx` to understand the existing link shape. Typical pattern is an array of `{ href, label, icon }` objects rendered as `<Link>` elements with active-route highlighting.

- [ ] **Step 2: Add three new nav items**

Insert these items into the existing nav array, before the Properties entry (or wherever it fits the existing order):

```tsx
{ href: '/conversations', label: 'Conversations', icon: MessageSquareIcon },
{ href: '/escalations',   label: 'Escalations',   icon: AlertCircleIcon },
{ href: '/analytics',     label: 'Analytics',     icon: BarChart3Icon },
```

The actual icon imports (`MessageSquareIcon`, `AlertCircleIcon`, `BarChart3Icon`) come from `lucide-react` which is already a dependency per `apps/web/package.json`. If the existing sidebar uses different icon imports, match that style instead. The three icon names above are the canonical lucide names.

Do NOT modify any existing nav items or layout code.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @omnilease/web typecheck 2>&1 | tail -10
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/dashboard/sidebar.tsx
git commit -m "feat(web): add conversations/escalations/analytics to dashboard sidebar"
```

---

### Task 2: Verify/create the browser Supabase client helper

**Files:**
- Verify exists: `apps/web/src/lib/supabase/browser-client.ts` (or similar)
- Create if missing

The existing Plan 1a code has `apps/web/src/lib/supabase/server.ts` (`createClient` for Server Components via `@supabase/ssr` cookies). For client components that need Supabase Realtime subscriptions, we need a browser-side client.

- [ ] **Step 1: Check what exists**

```bash
ls apps/web/src/lib/supabase/ 2>&1
```

If there's already a `browser-client.ts` / `client.ts` / `browser.ts` that exports a `createBrowserClient` or similar, use that in subsequent tasks and skip to Step 4 (commit noting no change needed).

- [ ] **Step 2: If missing, create `apps/web/src/lib/supabase/browser-client.ts`**

```ts
'use client';

import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  if (!key) throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set');
  return createBrowserClient(url, key);
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @omnilease/web typecheck 2>&1 | tail -10
```
Expected: clean.

- [ ] **Step 4: Commit (only if a new file was created)**

```bash
git add apps/web/src/lib/supabase/browser-client.ts
git commit -m "feat(web): add browser-side supabase client for realtime subscriptions"
```

If no file was created (helper already exists), skip the commit and note in the report.

---

### Task 3: Write `lib/realtime/supabase-subscribe.ts` (useLiveMessages hook)

**Files:**
- Create: `apps/web/src/lib/realtime/supabase-subscribe.ts`

This is a client hook that subscribes to `postgres_changes` on `public.messages` filtered by `conversation_id`. RLS already scopes by org — the authenticated user only receives messages belonging to their org's conversations.

- [ ] **Step 1: Create the module**

Create `apps/web/src/lib/realtime/supabase-subscribe.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client';
import type { Message } from '@omnilease/db';

/**
 * Subscribe to INSERTs on public.messages for a specific conversation.
 *
 * Returns the current message list (initialised from `initial`, then appended
 * to as new rows arrive). RLS on `messages` limits what the browser receives
 * to messages in conversations belonging to the user's org — we don't need
 * any extra client-side filtering.
 *
 * On disconnect, the Supabase client will attempt to reconnect automatically.
 * If that fails, callers can trigger a full refetch by remounting the hook
 * (e.g., via a router refresh from a parent Server Component).
 */
export function useLiveMessages(
  conversationId: string,
  initial: Message[],
): Message[] {
  const [messages, setMessages] = useState<Message[]>(initial);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as Message;
          setMessages((prev) => {
            // Dedupe: if the row already exists (e.g. because the Server
            // Component fetched it before the subscription opened), skip.
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, row];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  return messages;
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @omnilease/web typecheck 2>&1 | tail -20
```
Expected: clean.

**Likely issue:** If `Message` type can't be imported from `@omnilease/db`, fall back to a locally defined type:
```ts
type Message = {
  id: string;
  conversationId: string;
  role: string;
  authorType: string;
  content: string;
  channel: string;
  createdAt: string | Date;
  metadata: unknown;
};
```
and use `as Message` in the payload handler. The Drizzle `$inferSelect` should export `Message` via the barrel, but verify.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/realtime/supabase-subscribe.ts
git commit -m "feat(web): useLiveMessages hook for realtime conversation updates"
```

---

### Task 4: Write `components/conversations/message-list.tsx` (server component)

**Files:**
- Create: `apps/web/src/components/conversations/message-list.tsx`

This is the server component that renders the initial list of messages. The client component `LiveMessageList` wraps this with a Realtime subscription.

- [ ] **Step 1: Create the module**

Create `apps/web/src/components/conversations/message-list.tsx`:

```tsx
import type { Message } from '@omnilease/db';

export type MessageListProps = {
  messages: Message[];
};

function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function authorLabel(authorType: string): string {
  switch (authorType) {
    case 'prospect':
      return 'Prospect';
    case 'ai':
      return 'AI';
    case 'human_agent':
      return 'Agent';
    default:
      return authorType;
  }
}

function alignmentClass(authorType: string): string {
  return authorType === 'prospect' ? 'self-start' : 'self-end';
}

function bubbleClass(authorType: string): string {
  if (authorType === 'prospect') {
    return 'bg-slate-100 text-slate-900';
  }
  if (authorType === 'human_agent') {
    return 'bg-blue-600 text-white';
  }
  return 'bg-slate-900 text-white';
}

export function MessageList({ messages }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        No messages yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {messages.map((m) => (
        <div key={m.id} className={`flex flex-col gap-1 ${alignmentClass(m.authorType)}`}>
          <div className="text-xs text-slate-500">
            {authorLabel(m.authorType)} · {formatTime(m.createdAt)}
          </div>
          <div
            className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${bubbleClass(m.authorType)}`}
          >
            {m.content}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @omnilease/web typecheck 2>&1 | tail -10
git add apps/web/src/components/conversations/message-list.tsx
git commit -m "feat(web): MessageList server component for conversation detail"
```

---

### Task 5: Write `components/conversations/live-message-list.tsx` (client wrapper)

**Files:**
- Create: `apps/web/src/components/conversations/live-message-list.tsx`

- [ ] **Step 1: Create the module**

Create `apps/web/src/components/conversations/live-message-list.tsx`:

```tsx
'use client';

import type { Message } from '@omnilease/db';
import { useLiveMessages } from '@/lib/realtime/supabase-subscribe';
import { MessageList } from './message-list';

export type LiveMessageListProps = {
  conversationId: string;
  initial: Message[];
};

export function LiveMessageList({ conversationId, initial }: LiveMessageListProps) {
  const messages = useLiveMessages(conversationId, initial);
  return <MessageList messages={messages} />;
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @omnilease/web typecheck 2>&1 | tail -10
git add apps/web/src/components/conversations/live-message-list.tsx
git commit -m "feat(web): LiveMessageList client wrapper with realtime updates"
```

---

### Task 6: Write `(dashboard)/conversations/actions.ts` (server actions)

**Files:**
- Create: `apps/web/src/app/(dashboard)/conversations/actions.ts`

- [ ] **Step 1: Create the actions file**

Create `apps/web/src/app/(dashboard)/conversations/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db, eq, and, desc } from '@omnilease/db';
import {
  conversations,
  messages,
  properties,
  type ConversationStatus,
} from '@omnilease/db';
import { canReplyToConversation } from '@omnilease/shared';
import { requireOrg } from '@/lib/auth';
import { sendSms, OptedOutError, QuietHoursError } from '@/lib/twilio/send';
import { isDirectReplyWindow } from '@/lib/tcpa/quiet-hours';

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Load a conversation and assert it belongs to the caller's org.
 * Returns the conversation + property rows or throws a redirect on mismatch.
 */
async function loadConversationForOrg(conversationId: string, orgId: string) {
  const [row] = await db
    .select({
      conversation: conversations,
      property: properties,
    })
    .from(conversations)
    .innerJoin(properties, eq(properties.id, conversations.propertyId))
    .where(
      and(eq(conversations.id, conversationId), eq(properties.orgId, orgId)),
    )
    .limit(1);
  if (!row) redirect('/conversations');
  return row;
}

export async function sendAgentReply(
  conversationId: string,
  body: string,
): Promise<ActionResult> {
  const auth = await requireOrg();
  if (!canReplyToConversation(auth.role)) {
    return { ok: false, error: 'You do not have permission to reply.' };
  }
  const text = body.trim();
  if (!text) return { ok: false, error: 'Message cannot be empty.' };

  const { conversation, property } = await loadConversationForOrg(conversationId, auth.orgId);

  if (conversation.status === 'closed') {
    return { ok: false, error: 'Conversation is closed.' };
  }

  if (conversation.channel === 'sms') {
    if (!property.twilioPhone) {
      return { ok: false, error: 'Property has no Twilio number configured.' };
    }
    if (!conversation.prospectPhone) {
      return { ok: false, error: 'Conversation has no prospect phone on file.' };
    }

    // Check if we're within the 15-min direct-reply window by looking at
    // the most recent inbound.
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

    try {
      await sendSms({
        propertyId: property.id,
        propertyTimezone: property.timezone,
        from: property.twilioPhone,
        to: conversation.prospectPhone,
        body: text,
        directReply,
      });
    } catch (err) {
      if (err instanceof OptedOutError) {
        return { ok: false, error: 'Prospect has opted out.' };
      }
      if (err instanceof QuietHoursError) {
        return {
          ok: false,
          error: 'Outside quiet hours window. Try again during daytime hours or wait for the prospect to message first.',
        };
      }
      throw err;
    }

    await db.insert(messages).values({
      conversationId,
      role: 'assistant',
      authorType: 'human_agent',
      content: text,
      channel: 'sms',
    });
  } else if (conversation.channel === 'webchat') {
    // For webchat, just insert the row — the widget polls /api/widget/poll
    // and picks it up within its poll interval.
    await db.insert(messages).values({
      conversationId,
      role: 'assistant',
      authorType: 'human_agent',
      content: text,
      channel: 'webchat',
    });
  } else {
    return { ok: false, error: `Unsupported channel: ${conversation.channel}` };
  }

  revalidatePath(`/conversations/${conversationId}`);
  return { ok: true };
}

export async function updateStatus(
  conversationId: string,
  status: ConversationStatus,
): Promise<ActionResult> {
  const auth = await requireOrg();
  if (!canReplyToConversation(auth.role)) {
    return { ok: false, error: 'Forbidden' };
  }
  await loadConversationForOrg(conversationId, auth.orgId);

  await db
    .update(conversations)
    .set({ status })
    .where(eq(conversations.id, conversationId));

  revalidatePath('/conversations');
  revalidatePath(`/conversations/${conversationId}`);
  return { ok: true };
}

export async function closeConversation(conversationId: string) {
  return updateStatus(conversationId, 'closed');
}

export async function markConverted(conversationId: string) {
  return updateStatus(conversationId, 'converted');
}

export async function assignConversation(
  conversationId: string,
  userId: string,
): Promise<ActionResult> {
  const auth = await requireOrg();
  if (!canReplyToConversation(auth.role)) {
    return { ok: false, error: 'Forbidden' };
  }
  await loadConversationForOrg(conversationId, auth.orgId);

  await db
    .update(conversations)
    .set({ assignedAgentId: userId })
    .where(eq(conversations.id, conversationId));

  revalidatePath(`/conversations/${conversationId}`);
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @omnilease/web typecheck 2>&1 | tail -20
```
Expected: clean.

**Likely issues:**
- `ConversationStatus` type may not be exported from `@omnilease/db` — check `packages/db/src/schema/conversations.ts`. If missing, inline: `'active' | 'escalated' | 'closed' | 'converted'`.
- `canReplyToConversation` is exported from `@omnilease/shared` per Plan 1a — verify by grep if needed.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/conversations/actions.ts
git commit -m "feat(web): conversations server actions — sendAgentReply, updateStatus, assign"
```

---

### Task 7: Write `(dashboard)/conversations/[id]/composer.tsx`

**Files:**
- Create: `apps/web/src/app/(dashboard)/conversations/[id]/composer.tsx`

- [ ] **Step 1: Create the client component**

Create the file:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { sendAgentReply } from '../actions';

export type ComposerProps = {
  conversationId: string;
  disabled?: boolean;
};

export function Composer({ conversationId, disabled }: ComposerProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    setError(null);
    startTransition(async () => {
      const result = await sendAgentReply(conversationId, text);
      if (result.ok) {
        setText('');
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form onSubmit={submit} className="border-t border-slate-200 p-3">
      {error && (
        <div className="mb-2 rounded bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled || isPending}
          placeholder="Reply as agent…"
          rows={2}
          className="flex-1 resize-none rounded border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none disabled:bg-slate-50"
        />
        <button
          type="submit"
          disabled={disabled || isPending || !text.trim()}
          className="self-end rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
        >
          {isPending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @omnilease/web typecheck 2>&1 | tail -10
git add "apps/web/src/app/(dashboard)/conversations/[id]/composer.tsx"
git commit -m "feat(web): agent reply composer client component"
```

---

### Task 8: Write `(dashboard)/conversations/page.tsx` (list)

**Files:**
- Create: `apps/web/src/app/(dashboard)/conversations/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import Link from 'next/link';
import { db, eq, and, desc, sql } from '@omnilease/db';
import {
  conversations,
  messages,
  properties,
  type ConversationStatus,
  type ConversationChannel,
} from '@omnilease/db';
import { requireOrg } from '@/lib/auth';

const PAGE_SIZE = 50;

type SearchParams = Promise<{
  status?: string;
  channel?: string;
  propertyId?: string;
}>;

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-green-50 text-green-700';
    case 'escalated':
      return 'bg-red-50 text-red-700';
    case 'closed':
      return 'bg-slate-100 text-slate-600';
    case 'converted':
      return 'bg-blue-50 text-blue-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function channelLabel(channel: string): string {
  return channel === 'sms' ? 'SMS' : channel === 'webchat' ? 'Webchat' : channel;
}

function prospectLabel(row: {
  prospectName: string | null;
  prospectPhone: string | null;
  prospectEmail: string | null;
  externalId: string;
}): string {
  return row.prospectName ?? row.prospectPhone ?? row.prospectEmail ?? row.externalId;
}

function formatWhen(date: Date): string {
  const now = Date.now();
  const delta = now - date.getTime();
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function ConversationsListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const auth = await requireOrg();
  const params = await searchParams;

  const where = [eq(properties.orgId, auth.orgId)];
  if (params.status) {
    where.push(eq(conversations.status, params.status as ConversationStatus));
  }
  if (params.channel) {
    where.push(eq(conversations.channel, params.channel as ConversationChannel));
  }
  if (params.propertyId) {
    where.push(eq(conversations.propertyId, params.propertyId));
  }

  // Subquery: latest message content + timestamp per conversation.
  const latestMsgSub = db
    .select({
      conversationId: messages.conversationId,
      content: messages.content,
      createdAt: messages.createdAt,
      rn: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${messages.conversationId} ORDER BY ${messages.createdAt} DESC)`.as('rn'),
    })
    .from(messages)
    .as('latest_msg_sub');

  const rows = await db
    .select({
      id: conversations.id,
      status: conversations.status,
      channel: conversations.channel,
      externalId: conversations.externalId,
      prospectName: conversations.prospectName,
      prospectPhone: conversations.prospectPhone,
      prospectEmail: conversations.prospectEmail,
      updatedAt: conversations.updatedAt,
      propertyName: properties.name,
      latestPreview: latestMsgSub.content,
      latestAt: latestMsgSub.createdAt,
    })
    .from(conversations)
    .innerJoin(properties, eq(properties.id, conversations.propertyId))
    .leftJoin(
      latestMsgSub,
      and(eq(latestMsgSub.conversationId, conversations.id), eq(latestMsgSub.rn, 1)),
    )
    .where(and(...where))
    .orderBy(desc(conversations.updatedAt))
    .limit(PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Conversations</h1>
        <div className="flex gap-2 text-sm">
          <FilterLink label="All"       href="/conversations"                     active={!params.status} />
          <FilterLink label="Active"    href="/conversations?status=active"       active={params.status === 'active'} />
          <FilterLink label="Escalated" href="/conversations?status=escalated"    active={params.status === 'escalated'} />
          <FilterLink label="Closed"    href="/conversations?status=closed"       active={params.status === 'closed'} />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500">
          No conversations yet. They'll appear here as prospects message in.
        </div>
      ) : (
        <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/conversations/${row.id}`}
              className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">
                    {prospectLabel(row)}
                  </span>
                  <span className="text-xs text-slate-500">
                    · {row.propertyName}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-xs ${statusBadgeClass(row.status)}`}>
                    {row.status}
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {channelLabel(row.channel)}
                  </span>
                </div>
                <div className="mt-1 truncate text-sm text-slate-600">
                  {row.latestPreview ?? '(no messages)'}
                </div>
              </div>
              <div className="text-xs text-slate-500">
                {formatWhen(row.updatedAt)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterLink({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded px-3 py-1 ${active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
    >
      {label}
    </Link>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @omnilease/web typecheck 2>&1 | tail -20
git add "apps/web/src/app/(dashboard)/conversations/page.tsx"
git commit -m "feat(web): conversations list page with filters and latest-message preview"
```

**Likely issue:** The window-function subquery may need a slightly different drizzle form. If typecheck or runtime errors on the subquery, a simpler alternative is two separate queries: one for conversations, one for the latest message per conversation, joined in JS. Accept the simpler form if the subquery is fighting drizzle.

---

### Task 9: Write `(dashboard)/conversations/[id]/page.tsx` (detail)

**Files:**
- Create: `apps/web/src/app/(dashboard)/conversations/[id]/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { notFound } from 'next/navigation';
import { db, eq, and, asc } from '@omnilease/db';
import { conversations, messages, properties } from '@omnilease/db';
import { requireOrg } from '@/lib/auth';
import { LiveMessageList } from '@/components/conversations/live-message-list';
import { Composer } from './composer';
import { closeConversation, markConverted } from '../actions';

type Params = Promise<{ id: string }>;

function channelLabel(channel: string): string {
  return channel === 'sms' ? 'SMS' : channel === 'webchat' ? 'Webchat' : channel;
}

function prospectLabel(c: {
  prospectName: string | null;
  prospectPhone: string | null;
  prospectEmail: string | null;
  externalId: string;
}): string {
  return c.prospectName ?? c.prospectPhone ?? c.prospectEmail ?? c.externalId;
}

export default async function ConversationDetailPage({
  params,
}: {
  params: Params;
}) {
  const auth = await requireOrg();
  const { id } = await params;

  const [row] = await db
    .select({ conversation: conversations, property: properties })
    .from(conversations)
    .innerJoin(properties, eq(properties.id, conversations.propertyId))
    .where(and(eq(conversations.id, id), eq(properties.orgId, auth.orgId)))
    .limit(1);

  if (!row) notFound();

  const initial = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));

  const closeAction = closeConversation.bind(null, id);
  const convertAction = markConverted.bind(null, id);

  const isClosed = row.conversation.status === 'closed';

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">{prospectLabel(row.conversation)}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-600">
            <span>{row.property.name}</span>
            <span>·</span>
            <span>{channelLabel(row.conversation.channel)}</span>
            <span>·</span>
            <span className="capitalize">{row.conversation.status}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <form action={convertAction}>
            <button
              type="submit"
              disabled={isClosed}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:bg-slate-300"
            >
              Mark converted
            </button>
          </form>
          <form action={closeAction}>
            <button
              type="submit"
              disabled={isClosed}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:text-slate-400"
            >
              Close
            </button>
          </form>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-slate-50">
        <LiveMessageList conversationId={id} initial={initial} />
      </div>

      <Composer conversationId={id} disabled={isClosed} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @omnilease/web typecheck 2>&1 | tail -20
git add "apps/web/src/app/(dashboard)/conversations/[id]/page.tsx"
git commit -m "feat(web): conversation detail page with realtime + composer"
```

---

### Task 10: Write `(dashboard)/escalations/` (page + actions)

**Files:**
- Create: `apps/web/src/app/(dashboard)/escalations/page.tsx`
- Create: `apps/web/src/app/(dashboard)/escalations/actions.ts`

- [ ] **Step 1: Create the actions file**

`apps/web/src/app/(dashboard)/escalations/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { db, eq, and } from '@omnilease/db';
import { escalations, conversations, properties } from '@omnilease/db';
import { canReplyToConversation } from '@omnilease/shared';
import { requireOrg } from '@/lib/auth';

export type ActionResult = { ok: true } | { ok: false; error: string };

async function assertEscalationForOrg(escalationId: string, orgId: string) {
  const [row] = await db
    .select({ id: escalations.id })
    .from(escalations)
    .innerJoin(conversations, eq(conversations.id, escalations.conversationId))
    .innerJoin(properties, eq(properties.id, conversations.propertyId))
    .where(and(eq(escalations.id, escalationId), eq(properties.orgId, orgId)))
    .limit(1);
  return Boolean(row);
}

export async function resolveEscalation(
  escalationId: string,
  notes?: string,
): Promise<ActionResult> {
  const auth = await requireOrg();
  if (!canReplyToConversation(auth.role)) {
    return { ok: false, error: 'Forbidden' };
  }
  const allowed = await assertEscalationForOrg(escalationId, auth.orgId);
  if (!allowed) return { ok: false, error: 'Not found' };

  await db
    .update(escalations)
    .set({
      resolvedAt: new Date(),
      resolutionNotes: notes ?? null,
    })
    .where(eq(escalations.id, escalationId));

  revalidatePath('/escalations');
  return { ok: true };
}
```

- [ ] **Step 2: Create the page**

`apps/web/src/app/(dashboard)/escalations/page.tsx`:

```tsx
import Link from 'next/link';
import { db, eq, and, isNull, desc } from '@omnilease/db';
import { escalations, conversations, properties } from '@omnilease/db';
import { requireOrg } from '@/lib/auth';
import { resolveEscalation } from './actions';

function priorityClass(p: string): string {
  switch (p) {
    case 'urgent':
      return 'bg-red-100 text-red-800';
    case 'high':
      return 'bg-orange-100 text-orange-800';
    case 'normal':
      return 'bg-yellow-50 text-yellow-800';
    case 'low':
      return 'bg-slate-100 text-slate-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

export default async function EscalationsPage() {
  const auth = await requireOrg();

  const rows = await db
    .select({
      id: escalations.id,
      reason: escalations.reason,
      priority: escalations.priority,
      createdAt: escalations.createdAt,
      conversationId: escalations.conversationId,
      propertyName: properties.name,
      prospectName: conversations.prospectName,
      prospectPhone: conversations.prospectPhone,
    })
    .from(escalations)
    .innerJoin(conversations, eq(conversations.id, escalations.conversationId))
    .innerJoin(properties, eq(properties.id, conversations.propertyId))
    .where(and(eq(properties.orgId, auth.orgId), isNull(escalations.resolvedAt)))
    .orderBy(desc(escalations.createdAt));

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Open escalations</h1>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500">
          No open escalations. The AI is handling everything for now.
        </div>
      ) : (
        <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
          {rows.map((row) => {
            const resolveAction = resolveEscalation.bind(null, row.id, undefined);
            const prospect =
              row.prospectName ?? row.prospectPhone ?? 'unknown prospect';
            return (
              <div key={row.id} className="flex items-center gap-4 px-4 py-3">
                <span className={`rounded px-2 py-0.5 text-xs ${priorityClass(row.priority)}`}>
                  {row.priority}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900">
                    {prospect} · {row.propertyName}
                  </div>
                  <div className="mt-0.5 truncate text-sm text-slate-600">
                    {row.reason}
                  </div>
                </div>
                <Link
                  href={`/conversations/${row.conversationId}`}
                  className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Open
                </Link>
                <form action={resolveAction}>
                  <button
                    type="submit"
                    className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Resolve
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter @omnilease/web typecheck 2>&1 | tail -20
git add "apps/web/src/app/(dashboard)/escalations/"
git commit -m "feat(web): escalations queue page with resolve action"
```

---

### Task 11: Write `(dashboard)/analytics/page.tsx`

**Files:**
- Create: `apps/web/src/app/(dashboard)/analytics/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { db, eq, and, sql, gte } from '@omnilease/db';
import { conversations, messages, properties, escalations } from '@omnilease/db';
import { requireOrg } from '@/lib/auth';

export default async function AnalyticsPage() {
  const auth = await requireOrg();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Card 1: total conversations in last 30 days, split by channel
  const byChannel = await db
    .select({
      channel: conversations.channel,
      count: sql<number>`count(*)::int`,
    })
    .from(conversations)
    .innerJoin(properties, eq(properties.id, conversations.propertyId))
    .where(and(eq(properties.orgId, auth.orgId), gte(conversations.createdAt, thirtyDaysAgo)))
    .groupBy(conversations.channel);

  const totalConversations = byChannel.reduce((sum, r) => sum + Number(r.count), 0);
  const smsCount = Number(byChannel.find((r) => r.channel === 'sms')?.count ?? 0);
  const webchatCount = Number(byChannel.find((r) => r.channel === 'webchat')?.count ?? 0);

  // Cards 3 + 4: automation vs escalation rate
  const [autoStats] = await db
    .select({
      total: sql<number>`count(DISTINCT ${conversations.id})::int`,
      escalated: sql<number>`count(DISTINCT ${escalations.conversationId})::int`,
    })
    .from(conversations)
    .innerJoin(properties, eq(properties.id, conversations.propertyId))
    .leftJoin(escalations, eq(escalations.conversationId, conversations.id))
    .where(and(eq(properties.orgId, auth.orgId), gte(conversations.createdAt, thirtyDaysAgo)));

  const totalForRates = Number(autoStats?.total ?? 0);
  const escalatedCount = Number(autoStats?.escalated ?? 0);
  const escalationRate =
    totalForRates === 0 ? 0 : Math.round((escalatedCount / totalForRates) * 100);
  const automationRate = 100 - escalationRate;

  // Card 2: median AI response time (seconds) — simplistic: average of
  // (assistant.created_at - prior user.created_at) grouped by conversation.
  // For Phase 1 "basic analytics", average is acceptable; median in SQL is
  // possible via percentile_cont but not worth the complexity yet.
  const responseTimes = await db.execute(sql`
    WITH paired AS (
      SELECT
        m.conversation_id,
        m.created_at AS assistant_at,
        LAG(m.created_at) OVER (
          PARTITION BY m.conversation_id ORDER BY m.created_at
        ) AS prev_at,
        LAG(m.role) OVER (
          PARTITION BY m.conversation_id ORDER BY m.created_at
        ) AS prev_role
      FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
      JOIN public.properties p    ON p.id = c.property_id
      WHERE p.org_id = ${auth.orgId}
        AND m.created_at >= ${thirtyDaysAgo}
        AND m.role = 'assistant'
        AND m.author_type = 'ai'
    )
    SELECT AVG(EXTRACT(EPOCH FROM (assistant_at - prev_at)))::int AS avg_seconds
    FROM paired
    WHERE prev_role = 'user' AND prev_at IS NOT NULL;
  `);
  const avgSecondsRow = (responseTimes as unknown as { rows: { avg_seconds: number | null }[] }).rows[0];
  const avgResponseSeconds = avgSecondsRow?.avg_seconds ?? null;

  // Chart 1: conversations per day (30 days)
  const perDay = await db.execute(sql`
    SELECT
      DATE_TRUNC('day', c.created_at) AS day,
      COUNT(*)::int AS count
    FROM public.conversations c
    JOIN public.properties p ON p.id = c.property_id
    WHERE p.org_id = ${auth.orgId}
      AND c.created_at >= ${thirtyDaysAgo}
    GROUP BY DATE_TRUNC('day', c.created_at)
    ORDER BY day ASC;
  `);
  const perDayRows =
    (perDay as unknown as { rows: { day: string | Date; count: number }[] }).rows ?? [];
  const maxDayCount = perDayRows.reduce((m, r) => Math.max(m, Number(r.count)), 0) || 1;

  // Chart 2: top intents from messages.metadata.intent
  const intents = await db.execute(sql`
    SELECT
      m.metadata->>'intent' AS intent,
      COUNT(*)::int AS count
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    JOIN public.properties p    ON p.id = c.property_id
    WHERE p.org_id = ${auth.orgId}
      AND m.created_at >= ${thirtyDaysAgo}
      AND m.role = 'user'
      AND m.metadata->>'intent' IS NOT NULL
    GROUP BY m.metadata->>'intent'
    ORDER BY count DESC
    LIMIT 8;
  `);
  const intentRows =
    (intents as unknown as { rows: { intent: string; count: number }[] }).rows ?? [];
  const maxIntentCount = intentRows.reduce((m, r) => Math.max(m, Number(r.count)), 0) || 1;

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Analytics (last 30 days)</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card label="Conversations" value={String(totalConversations)} hint={`${smsCount} SMS · ${webchatCount} webchat`} />
        <Card
          label="Median AI response"
          value={avgResponseSeconds != null ? `${avgResponseSeconds}s` : '—'}
          hint="target: <5s"
        />
        <Card label="Automation rate" value={`${automationRate}%`} hint="target: >85%" />
        <Card label="Escalation rate" value={`${escalationRate}%`} hint="lower is better" />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium text-slate-700">Conversations per day</h2>
        <div className="flex h-32 items-end gap-1 rounded-lg border border-slate-200 p-3">
          {perDayRows.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
              No data yet.
            </div>
          ) : (
            perDayRows.map((r, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-slate-900"
                style={{ height: `${(Number(r.count) / maxDayCount) * 100}%` }}
                title={`${new Date(r.day as string).toLocaleDateString()}: ${r.count}`}
              />
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-slate-700">Top prospect intents</h2>
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-4">
          {intentRows.length === 0 ? (
            <div className="text-sm text-slate-500">No data yet.</div>
          ) : (
            intentRows.map((r) => (
              <div key={r.intent} className="flex items-center gap-3">
                <div className="w-24 text-sm capitalize text-slate-700">{r.intent}</div>
                <div className="h-3 flex-1 rounded bg-slate-100">
                  <div
                    className="h-3 rounded bg-slate-900"
                    style={{ width: `${(Number(r.count) / maxIntentCount) * 100}%` }}
                  />
                </div>
                <div className="w-10 text-right text-sm text-slate-600">{r.count}</div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @omnilease/web typecheck 2>&1 | tail -30
git add "apps/web/src/app/(dashboard)/analytics/page.tsx"
git commit -m "feat(web): basic analytics page with cards and bar charts"
```

**Likely issue:** `db.execute(sql\`...\`)` return shape varies by postgres driver. With `postgres-js` (our driver), `db.execute` returns `{ rows: Row[] }` for SELECT queries. The `as unknown as { rows: ... }` casts are defensive. If typecheck complains, wrap more tightly or fall back to raw postgres client calls.

---

### Task 12: Write `/api/widget/poll/route.ts`

**Files:**
- Create: `apps/web/src/app/api/widget/poll/route.ts`

The widget polls this GET endpoint periodically to pick up agent replies typed into the dashboard composer.

- [ ] **Step 1: Create the route**

```ts
import { type NextRequest } from 'next/server';
import { db, eq, and, gt, asc } from '@omnilease/db';
import { conversations, messages, properties } from '@omnilease/db';

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const widgetId = url.searchParams.get('widgetId');
  const sessionId = url.searchParams.get('sessionId');
  const since = url.searchParams.get('since');

  if (!widgetId || !sessionId) {
    return Response.json({ error: 'widgetId and sessionId required' }, { status: 400 });
  }

  const [property] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.webchatWidgetId, widgetId))
    .limit(1);
  if (!property) return Response.json({ error: 'unknown widget' }, { status: 404 });

  const [conversation] = await db
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

  if (!conversation) {
    return Response.json({ messages: [] });
  }

  // Only return human_agent messages newer than `since`. AI messages already
  // come down the streaming channel, so the widget doesn't need them again.
  // Prospect messages are also excluded — they came from the widget itself.
  const conditions = [
    eq(messages.conversationId, conversation.id),
    eq(messages.authorType, 'human_agent'),
  ];
  if (since) {
    const sinceDate = new Date(since);
    if (!Number.isNaN(sinceDate.getTime())) {
      conditions.push(gt(messages.createdAt, sinceDate));
    }
  }

  const rows = await db
    .select({
      id: messages.id,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(and(...conditions))
    .orderBy(asc(messages.createdAt))
    .limit(50);

  return Response.json({
    messages: rows.map((r) => ({
      id: r.id,
      content: r.content,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    })),
  });
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @omnilease/web typecheck 2>&1 | tail -10
git add "apps/web/src/app/api/widget/poll/route.ts"
git commit -m "feat(web): widget poll endpoint for agent-typed replies"
```

---

### Task 13: Update `public/widget.js` with polling loop

**Files:**
- Modify: `apps/web/public/widget.js`

Add a polling loop that runs while the panel is open. It tracks the last-seen timestamp and fetches new `human_agent` messages every 5 seconds. On each new message, it appends an assistant bubble.

- [ ] **Step 1: Read the current widget**

Read `apps/web/public/widget.js` to find where the IIFE variables are declared and where the panel open/close handler lives.

- [ ] **Step 2: Add polling state and start/stop functions**

Near the top of the IIFE (after the `let panelOpen = false;` line), add:

```js
  let pollTimer = null;
  let lastSeenAt = null;

  async function pollForAgentReplies() {
    if (!sessionId) return;
    try {
      const url = new URL(origin + '/api/widget/poll');
      url.searchParams.set('widgetId', widgetId);
      url.searchParams.set('sessionId', sessionId);
      if (lastSeenAt) url.searchParams.set('since', lastSeenAt);
      const res = await fetch(url.toString());
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.messages)) {
        for (const m of data.messages) {
          addBubble('assistant', m.content);
          lastSeenAt = m.createdAt;
        }
      }
    } catch {
      // Swallow — next tick tries again
    }
  }

  function startPolling() {
    if (pollTimer) return;
    pollForAgentReplies(); // immediate first poll
    pollTimer = setInterval(pollForAgentReplies, 5000);
  }

  function stopPolling() {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = null;
  }
```

- [ ] **Step 3: Hook the polling into the panel toggle**

Find the `bubble.addEventListener('click', () => {` block. After the panel's display toggle, add start/stop polling calls. The existing block should be transformed to:

```js
    bubble.addEventListener('click', () => {
      panelOpen = !panelOpen;
      panel.style.display = panelOpen ? 'flex' : 'none';
      if (panelOpen && messagesEl.childElementCount === 0) {
        addBubble('assistant', property.welcomeMessage);
      }
      if (panelOpen) {
        startPolling();
      } else {
        stopPolling();
      }
    });
```

- [ ] **Step 4: After a streaming reply completes, update lastSeenAt**

Find the `streamReply` function. At the end (after the `while` loop), add:

```js
    // Mark "now" as the last seen timestamp so the next poll doesn't return
    // messages we already rendered.
    lastSeenAt = new Date().toISOString();
```

- [ ] **Step 5: Verify syntax**

```bash
node --check apps/web/public/widget.js
```
Expected: no output (valid).

- [ ] **Step 6: Commit**

```bash
git add apps/web/public/widget.js
git commit -m "feat(web): widget polls for human_agent replies while panel is open"
```

---

### Task 14: Integration test — sendAgentReply for both channels

**Files:**
- Create: `apps/web/src/app/(dashboard)/conversations/__tests__/actions.int.test.ts`

- [ ] **Step 1: Write the test**

Create the file:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoisted mock for sendSms — we don't want to hit Twilio.
const { sendSmsMock } = vi.hoisted(() => ({
  sendSmsMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/twilio/send', async () => {
  const actual = await vi.importActual<typeof import('@/lib/twilio/send')>('@/lib/twilio/send');
  return {
    ...actual,
    sendSms: sendSmsMock,
  };
});

// Mock requireOrg to return a deterministic auth context. We could seed a
// real user row, but the action only uses orgId/role from it, so a direct
// mock is simpler and faster.
const { requireOrgMock } = vi.hoisted(() => ({
  requireOrgMock: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  requireOrg: requireOrgMock,
}));

// Next.js revalidatePath / redirect are Node-side — stub to no-ops.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect called: ${url}`);
  },
}));

import { db, eq } from '@omnilease/db';
import {
  organizations,
  properties,
  conversations,
  messages,
} from '@omnilease/db';
import { sendAgentReply, closeConversation } from '../actions';

const TEST_PREFIX = 'actions-int-';

async function seed() {
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
      twilioPhone: '+15557654321',
      webchatWidgetId: `wdg_${Date.now()}`,
    })
    .returning();
  return { orgId: org.id, propertyId: prop.id };
}

async function cleanup(orgId: string) {
  await db.delete(organizations).where(eq(organizations.id, orgId));
}

async function seedConversation(propertyId: string, channel: 'sms' | 'webchat') {
  const [conv] = await db
    .insert(conversations)
    .values({
      propertyId,
      channel,
      externalId: channel === 'sms' ? '+15551111111' : 'sess_abc',
      prospectPhone: channel === 'sms' ? '+15551111111' : null,
      status: 'active',
    })
    .returning();
  // Insert a prior inbound so directReply window check works (it picks up
  // the most recent user message and uses it as the "last inbound" anchor).
  await db.insert(messages).values({
    conversationId: conv.id,
    role: 'user',
    authorType: 'prospect',
    content: 'hello',
    channel,
  });
  return conv.id;
}

describe('sendAgentReply (integration)', () => {
  beforeEach(() => {
    sendSmsMock.mockReset();
    sendSmsMock.mockResolvedValue(undefined);
    requireOrgMock.mockReset();
  });

  it('SMS path: calls sendSms and persists human_agent message', async () => {
    const { orgId, propertyId } = await seed();
    try {
      requireOrgMock.mockResolvedValue({
        userId: 'u1',
        authUserId: 'au1',
        email: 'agent@example.com',
        orgId,
        orgSlug: 'test',
        role: 'agent',
      });

      const conversationId = await seedConversation(propertyId, 'sms');
      const result = await sendAgentReply(conversationId, 'Hi there, following up.');
      expect(result.ok).toBe(true);

      expect(sendSmsMock).toHaveBeenCalledTimes(1);
      const arg = sendSmsMock.mock.calls[0][0];
      expect(arg.to).toBe('+15551111111');
      expect(arg.body).toBe('Hi there, following up.');
      expect(arg.directReply).toBe(true);

      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId));
      const agentMsg = rows.find((r) => r.authorType === 'human_agent');
      expect(agentMsg?.content).toBe('Hi there, following up.');
      expect(agentMsg?.channel).toBe('sms');
    } finally {
      await cleanup(orgId);
    }
  });

  it('webchat path: persists human_agent message without calling sendSms', async () => {
    const { orgId, propertyId } = await seed();
    try {
      requireOrgMock.mockResolvedValue({
        userId: 'u1',
        authUserId: 'au1',
        email: 'agent@example.com',
        orgId,
        orgSlug: 'test',
        role: 'agent',
      });

      const conversationId = await seedConversation(propertyId, 'webchat');
      const result = await sendAgentReply(conversationId, 'Following up via webchat.');
      expect(result.ok).toBe(true);

      expect(sendSmsMock).not.toHaveBeenCalled();

      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId));
      const agentMsg = rows.find((r) => r.authorType === 'human_agent');
      expect(agentMsg?.content).toBe('Following up via webchat.');
      expect(agentMsg?.channel).toBe('webchat');
    } finally {
      await cleanup(orgId);
    }
  });

  it('rejects reply on a closed conversation', async () => {
    const { orgId, propertyId } = await seed();
    try {
      requireOrgMock.mockResolvedValue({
        userId: 'u1',
        authUserId: 'au1',
        email: 'agent@example.com',
        orgId,
        orgSlug: 'test',
        role: 'agent',
      });

      const conversationId = await seedConversation(propertyId, 'sms');
      await closeConversation(conversationId);

      const result = await sendAgentReply(conversationId, 'hi');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/closed/i);
      }
      expect(sendSmsMock).not.toHaveBeenCalled();
    } finally {
      await cleanup(orgId);
    }
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm --filter @omnilease/web test "src/app/(dashboard)/conversations/__tests__/actions.int.test.ts" 2>&1 | tail -40
```
Expected: PASS (3 tests).

**Likely issues:**
- Vitest's include glob may not pick up files under `(dashboard)` due to the literal parentheses. Check `apps/web/vitest.config.ts` — if needed, either escape the parentheses in an include pattern or move the test to a flatter location under `src/lib/__tests__/` and import the actions via their full path (`@/app/(dashboard)/conversations/actions`).
- `requireOrg` is imported in `actions.ts` as `from '@/lib/auth'`. The mock path must match that exact specifier.
- `redirect` from `next/navigation` — if `loadConversationForOrg` doesn't find a row, it calls `redirect('/conversations')` which in our test mock throws. The happy-path tests shouldn't hit that — they seed real rows. The "closed" test uses `sendAgentReply` on a valid-but-closed conversation, which should pass the load check.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(dashboard)/conversations/__tests__/actions.int.test.ts"
git commit -m "test(web): integration test for sendAgentReply sms + webchat + closed paths"
```

---

### Task 15: Final typecheck + full test sweep + branch ready

**Files:** none

- [ ] **Step 1: Workspace typecheck**

```bash
pnpm -r typecheck 2>&1 | tail -15
```
Expected: clean.

- [ ] **Step 2: Full web test suite**

```bash
pnpm --filter @omnilease/web test 2>&1 | tail -30
```
Expected: Plans 1a + 1b (79 tests) plus Plan 1c's 3 new tests = 82 tests passing. No regressions.

- [ ] **Step 3: Confirm pages typecheck-render without running `next dev`**

The Next.js typechecker catches most SSG/SSR issues. If `tsc --noEmit` passes, pages are import-valid. Manual browser verification is up to the user when they `pnpm dev`.

- [ ] **Step 4: Review commits**

```bash
git log --oneline main..HEAD
```
Expected: ~14 commits for Plan 1c.

- [ ] **Step 5: Done**

No fix-up commit needed unless something drifted. Report the final commit count and test count.

---

## Definition of Done

Plan 1c is complete when:

1. Sidebar has Conversations, Escalations, and Analytics links
2. `lib/realtime/supabase-subscribe.ts` exports `useLiveMessages` (client hook)
3. `components/conversations/{message-list,live-message-list}.tsx` exist and typecheck
4. `(dashboard)/conversations/page.tsx` list view renders org-scoped conversations with filters
5. `(dashboard)/conversations/[id]/page.tsx` detail view loads initial messages + renders `LiveMessageList` + Composer
6. `(dashboard)/conversations/actions.ts` exports `sendAgentReply`, `closeConversation`, `markConverted`, `assignConversation` — all `requireOrg()`-guarded
7. `(dashboard)/escalations/page.tsx` + `actions.ts` work end-to-end
8. `(dashboard)/analytics/page.tsx` shows 4 cards + 2 charts with real queries
9. `/api/widget/poll/route.ts` returns only `human_agent` messages newer than `since`
10. `public/widget.js` polls `/api/widget/poll` every 5 seconds while the panel is open
11. Integration test for `sendAgentReply` passes (3 cases: SMS, webchat, closed)
12. `pnpm -r typecheck` clean
13. Full web test suite passes (82 tests expected)
14. No Plan 1a or 1b regressions

## Known deferred items (post-Phase 1)

- Widget Supabase Realtime subscription (instead of polling) — requires an anon JWT minted from `/api/widget/session` and a new RLS policy reading `auth.jwt() ->> 'conversation_id'`. Worth ~1 day of focused work.
- Cursor-based pagination for conversations list (currently PAGE_SIZE=50 with no pagination UI)
- Median (p50) response time in SQL — currently shows average via `AVG`
- Conversion funnel analytics (tour booked → converted) — needs `tour_bookings` table from Phase 2
- Team inbox / conversation assignment UI — `assignConversation` action exists but no UI
- Audit trail view for safety-flagged messages (`metadata.safety_flag` is persisted, just unsurfaced)
- Agent typing indicators on the widget
- Push notifications for urgent escalations (currently email-only)
