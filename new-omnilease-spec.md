# Multifamily AI Answering Service — Technical Specification & Requirements

> **Project Codename:** TBD
> **Author:** Bikram
> **Date:** April 2026
> **Version:** 1.0 — MVP Specification

---

## 1. Executive Summary

Build an AI-powered answering and leasing assistant for multifamily property management — delivering the core functionality of EliseAI at a fraction of the cost. The product targets independent operators and mid-size portfolios (50–500 units) who need 24/7 prospect and resident communication but can't justify enterprise pricing or lengthy implementation cycles.

### Value Proposition

- **EliseAI estimated cost:** $15–25+/unit/month, $10K–$50K implementation
- **Our target price:** $3–5/unit/month, self-serve onboarding
- **Core promise:** Same 24/7 AI coverage for leasing inquiries, tour scheduling, and resident FAQs — without the enterprise overhead

---

## 2. Competitive Analysis — What EliseAI Does

### Feature Map

| Feature | EliseAI | Our MVP (Phase 1) | Phase 2 | Phase 3 |
|---|---|---|---|---|
| SMS conversations | ✅ | ✅ | ✅ | ✅ |
| Email responses | ✅ | ❌ | ✅ | ✅ |
| Webchat widget | ✅ | ✅ | ✅ | ✅ |
| Voice/IVR | ✅ | ❌ | ❌ | ✅ |
| Tour scheduling | ✅ | ❌ | ✅ | ✅ |
| FAQ answering (pricing, pets, amenities) | ✅ | ✅ | ✅ | ✅ |
| Follow-up sequences | ✅ | ❌ | ✅ | ✅ |
| PMS integration | ✅ (deep) | ❌ | ❌ | ✅ (1 PMS) |
| Maintenance requests | ✅ | ❌ | ❌ | ✅ |
| Delinquency reminders | ✅ | ❌ | ❌ | ✅ |
| Renewal outreach | ✅ | ❌ | ❌ | ✅ |
| CRM / conversation dashboard | ✅ | Basic | ✅ | ✅ |
| Multi-language support | ✅ (51 written) | ✅ (via LLM) | ✅ | ✅ |
| Human handoff / escalation | ✅ | ✅ | ✅ | ✅ |
| Analytics / reporting | ✅ | Basic | ✅ | ✅ |

### EliseAI Weaknesses to Exploit

- **Rigid responses:** G2 reviews consistently mention limited customization and stiff handling of complex queries
- **Difficult handoff:** Users report the AI keeps trying to help even when the prospect explicitly asks for a human
- **Expensive setup:** $10K–$50K implementation costs price out smaller operators
- **Enterprise sales process:** Demo-only pricing, long sales cycles
- **Source attribution issues:** Multiple users report EliseAI manipulates lead source reporting

---

## 3. Product Requirements

### 3.1 Functional Requirements

#### FR-1: AI Conversation Engine

- **FR-1.1:** Respond to inbound prospect questions about the property using a configurable knowledge base (pricing, availability, pet policy, amenities, parking, lease terms, move-in costs, neighborhood info)
- **FR-1.2:** Handle multiple questions in a single message
- **FR-1.3:** Recognize typos, slang, and informal language
- **FR-1.4:** Support multi-language conversations (leverage LLM native multilingual capability)
- **FR-1.5:** Maintain conversation context across multiple exchanges within a session
- **FR-1.6:** Detect prospect intent (touring, pricing, application, complaint, maintenance)
- **FR-1.7:** Respond within 5 seconds for text channels, 2 seconds for webchat

#### FR-2: Multi-Channel Communication

- **FR-2.1 (Phase 1):** SMS — receive and reply to inbound texts via a dedicated property phone number
- **FR-2.2 (Phase 1):** Webchat — embeddable JavaScript widget for property websites
- **FR-2.3 (Phase 2):** Email — monitor a property inbox, parse inbound emails, and respond
- **FR-2.4 (Phase 3):** Voice/IVR — answer inbound calls, use speech-to-text + text-to-speech for conversational voice

#### FR-3: Tour Scheduling (Phase 2)

- **FR-3.1:** Integrate with Google Calendar or Calendly to check agent availability
- **FR-3.2:** Offer available time slots to prospects via conversation
- **FR-3.3:** Confirm bookings and send calendar invites to both prospect and leasing agent
- **FR-3.4:** Handle rescheduling and cancellation
- **FR-3.5:** Support self-guided, in-person, and virtual tour types

#### FR-4: Human Escalation

- **FR-4.1:** Detect when a prospect explicitly requests a human ("let me talk to someone")
- **FR-4.2:** Detect when the AI lacks confidence in its answer (confidence score < threshold)
- **FR-4.3:** Detect sensitive topics requiring human judgment (fair housing questions, ADA accommodations, legal disputes, complaints)
- **FR-4.4:** Notify leasing agent via SMS, email, or Slack with full conversation context
- **FR-4.5:** Gracefully inform the prospect that a team member will follow up, with an estimated response time

#### FR-5: Admin Dashboard

- **FR-5.1:** Property configuration panel (add/edit property details, pricing, policies, FAQs)
- **FR-5.2:** Conversation log viewer with search and filtering
- **FR-5.3:** Escalation queue showing conversations needing human attention
- **FR-5.4:** Analytics: total conversations, response time, escalation rate, top questions, lead conversion
- **FR-5.5:** Multi-property support with property switching
- **FR-5.6:** User roles: Admin, Property Manager, Leasing Agent

#### FR-6: Property Knowledge Base

- **FR-6.1:** Structured data entry for: unit types & floorplans, pricing & specials, pet policy (breeds, weight limits, deposits, monthly pet rent), parking (types, costs, availability), amenities list, lease terms, application requirements & fees, move-in costs, utility information, neighborhood highlights, office hours, maintenance request process
- **FR-6.2:** Support for uploading documents (lease templates, community guidelines) for AI to reference
- **FR-6.3:** Real-time availability updates (manual or via PMS integration in Phase 3)

#### FR-7: Follow-Up Sequences (Phase 2)

- **FR-7.1:** Automated follow-up messages to prospects who inquired but didn't schedule a tour
- **FR-7.2:** Configurable timing (e.g., 24hr, 3-day, 7-day follow-ups)
- **FR-7.3:** Opt-out handling for SMS compliance (STOP keyword)

#### FR-8: PMS Integration (Phase 3)

- **FR-8.1:** Integrate with one PMS platform (target: AppFolio or Entrata)
- **FR-8.2:** Pull real-time unit availability and pricing
- **FR-8.3:** Sync tour bookings to PMS calendar
- **FR-8.4:** Push new lead / guest card data to PMS

### 3.2 Non-Functional Requirements

#### NFR-1: Performance

- API response time: < 500ms (excluding LLM inference)
- LLM response generation: < 5 seconds p95
- SMS delivery: < 3 seconds after AI response generated
- System uptime: 99.9% (critical — this replaces after-hours staff)
- Concurrent conversations: support 100+ simultaneous across all properties

#### NFR-2: Security

- All data encrypted at rest (AES-256) and in transit (TLS 1.3)
- SOC 2 Type II compliance (target for post-MVP, but architect for it)
- PII handling: prospect phone numbers, emails, and conversation logs stored with access controls
- Data retention policies configurable per customer
- API authentication via JWT + API keys

#### NFR-3: Compliance

- **TCPA compliance** for SMS: express written consent before outbound messaging, STOP/opt-out handling, message frequency limits, required disclosures
- **Fair Housing Act:** AI must never make statements that could be construed as discriminatory (train/prompt-engineer against this explicitly)
- **CAN-SPAM** for email channel
- **State-specific regulations** for call recording if voice channel is used

#### NFR-4: Scalability

- Horizontally scalable message processing (queue-based architecture)
- Support 1,000+ properties without architectural changes
- Database partitioning strategy for conversation data

---

## 4. Technical Architecture

### 4.1 System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     INBOUND CHANNELS                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌───────────────┐  │
│  │  SMS    │  │  Email  │  │ Webchat │  │  Voice (P3)   │  │
│  │ (Twilio)│  │(SendGrid│  │ (Widget)│  │  (Twilio)     │  │
│  └────┬────┘  └────┬────┘  └────┬────┘  └──────┬────────┘  │
│       │            │            │               │           │
└───────┼────────────┼────────────┼───────────────┼───────────┘
        │            │            │               │
        ▼            ▼            ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│                   MESSAGE INGESTION LAYER                   │
│              (API Gateway / Webhook Handlers)                │
│                   Normalize all channels                     │
│                   to unified message format                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    MESSAGE QUEUE                             │
│              (Redis / BullMQ or SQS)                        │
│         Ensures reliable processing, retry logic            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                 CONVERSATION ENGINE                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  1. Load property context (knowledge base)           │   │
│  │  2. Load conversation history                        │   │
│  │  3. Classify intent                                  │   │
│  │  4. Check escalation triggers                        │   │
│  │  5. Generate response via LLM (Claude API)           │   │
│  │  6. Apply safety filters (fair housing, PII)         │   │
│  │  7. Route response to outbound channel               │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
┌───────────────┐ ┌──────────────┐ ┌──────────────────┐
│  OUTBOUND     │ │  ESCALATION  │ │  DATA LAYER      │
│  CHANNELS     │ │  ENGINE      │ │                  │
│  (Twilio,     │ │  (Slack,SMS, │ │  PostgreSQL      │
│   SendGrid,   │ │   Email to   │ │  (conversations, │
│   WebSocket)  │ │   agent)     │ │   properties,    │
└───────────────┘ └──────────────┘ │   leads, config) │
                                   │  Redis (cache,   │
                                   │   sessions)      │
                                   └──────────────────┘
                                           │
                                           ▼
                                   ┌──────────────────┐
                                   │  ADMIN DASHBOARD  │
                                   │  (Next.js)        │
                                   │  - Config panel   │
                                   │  - Conv. viewer   │
                                   │  - Analytics      │
                                   │  - Escalation Q   │
                                   └──────────────────┘
```

### 4.2 Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Runtime** | Node.js (v20+) | Best Twilio/SendGrid SDK support, fast async I/O |
| **API Framework** | Fastify or Express.js | Lightweight, well-documented |
| **LLM Provider** | Anthropic Claude API (claude-sonnet-4-20250514) | Best price/performance for conversational AI, strong safety guardrails |
| **SMS/Voice** | Twilio | Industry standard, reliable, good docs |
| **Email** | SendGrid (inbound parse + outbound) | Handles both directions, generous free tier |
| **Webchat** | Custom React widget (embeddable) | Full control over UX, lightweight |
| **Database** | PostgreSQL (via Supabase or managed RDS) | Relational data, JSONB for flexible schemas |
| **Cache/Queue** | Redis + BullMQ | Message queuing, session cache, rate limiting |
| **Frontend** | Next.js 14+ (App Router) | Dashboard, SSR, API routes |
| **Auth** | Clerk or NextAuth.js | Multi-tenant auth with roles |
| **Hosting** | Railway or Render (MVP) → AWS (scale) | Simple deployment, scales when needed |
| **Monitoring** | Sentry (errors) + Posthog (analytics) | Free tiers available |
| **Calendar** | Google Calendar API or Calendly API | Tour scheduling integration |
| **File Storage** | S3 or Cloudflare R2 | Document uploads, conversation exports |

### 4.3 LLM Integration Design

#### System Prompt Architecture

Each property gets a dynamically assembled system prompt:

```
SYSTEM PROMPT STRUCTURE:
├── Base instructions (role, tone, safety rules, fair housing guardrails)
├── Property-specific context (pulled from DB at request time)
│   ├── Property name, address, office hours
│   ├── Unit types, floorplans, pricing
│   ├── Pet policy details
│   ├── Parking info
│   ├── Amenities list
│   ├── Lease terms & move-in costs
│   ├── Current specials / promotions
│   ├── Neighborhood highlights
│   └── Custom FAQs
├── Available actions (what the AI can do)
│   ├── Answer questions
│   ├── Schedule tours (Phase 2)
│   ├── Collect prospect info (name, email, move-in date, unit preferences)
│   └── Escalate to human
├── Escalation rules
│   ├── Explicit human request → escalate
│   ├── Fair housing / legal topic → escalate
│   ├── Complaint / negative sentiment → escalate
│   ├── Pricing negotiation → escalate
│   └── 3+ unanswered questions in sequence → escalate
└── Response format instructions
    ├── Keep responses concise (2-3 sentences for SMS)
    ├── Use property name naturally
    ├── Include relevant details without over-sharing
    └── Always end with a soft CTA (schedule tour, ask more questions)
```

#### LLM Call Flow

```javascript
// Pseudocode for conversation engine
async function handleMessage(inboundMessage) {
  // 1. Identify property from phone number / widget ID
  const property = await getPropertyByChannel(inboundMessage.channel_id);

  // 2. Load or create conversation
  const conversation = await getOrCreateConversation(
    inboundMessage.from,
    property.id
  );

  // 3. Build messages array (last N turns for context window management)
  const history = await getConversationHistory(conversation.id, { limit: 20 });

  // 4. Assemble system prompt with property context
  const systemPrompt = buildSystemPrompt(property);

  // 5. Call LLM
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,  // Keep responses concise
    system: systemPrompt,
    messages: [
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: "user", content: inboundMessage.body }
    ],
    tools: [
      { name: "schedule_tour", ... },
      { name: "escalate_to_human", ... },
      { name: "collect_prospect_info", ... },
      { name: "check_availability", ... }
    ]
  });

  // 6. Process tool calls if any
  if (response.stop_reason === "tool_use") {
    return await handleToolCall(response, conversation, property);
  }

  // 7. Safety filter (check for fair housing violations, PII leakage)
  const filtered = await applySafetyFilters(response.content[0].text);

  // 8. Send response via original channel
  await sendResponse(inboundMessage.channel, filtered, conversation);

  // 9. Log everything
  await logConversationTurn(conversation.id, inboundMessage, filtered);
}
```

#### Token & Cost Management

| Metric | Estimate |
|---|---|
| System prompt | ~800–1,200 tokens |
| Average conversation history (10 turns) | ~1,500 tokens |
| Average response | ~100–200 tokens |
| Cost per conversation turn (Sonnet) | ~$0.005–$0.01 |
| Average conversation (5 turns) | ~$0.03–$0.05 |
| Monthly cost per 200-unit property (~500 conversations) | ~$15–$25 in LLM costs |

### 4.4 Database Schema (Core Tables)

```sql
-- Organizations (customers / management companies)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    plan TEXT DEFAULT 'starter',  -- starter, growth, enterprise
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Properties
CREATE TABLE properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    timezone TEXT DEFAULT 'America/New_York',
    office_hours JSONB,  -- { mon: { open: "9:00", close: "18:00" }, ... }
    twilio_phone TEXT,  -- dedicated SMS number
    webchat_widget_id TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Property Knowledge Base
CREATE TABLE property_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID REFERENCES properties(id),
    category TEXT NOT NULL,  -- pricing, pets, parking, amenities, lease_terms, etc.
    content JSONB NOT NULL,  -- flexible structure per category
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unit Types / Floorplans
CREATE TABLE unit_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID REFERENCES properties(id),
    name TEXT NOT NULL,  -- "1BR/1BA", "Studio", "2BR/2BA Penthouse"
    bedrooms INT,
    bathrooms NUMERIC(3,1),
    sqft_min INT,
    sqft_max INT,
    price_min NUMERIC(10,2),
    price_max NUMERIC(10,2),
    available_count INT DEFAULT 0,
    deposit NUMERIC(10,2),
    description TEXT,
    is_active BOOLEAN DEFAULT true
);

-- Conversations
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID REFERENCES properties(id),
    channel TEXT NOT NULL,  -- sms, email, webchat, voice
    external_id TEXT,  -- prospect phone number, email, or session ID
    prospect_name TEXT,
    prospect_email TEXT,
    prospect_phone TEXT,
    status TEXT DEFAULT 'active',  -- active, escalated, closed, converted
    escalated_at TIMESTAMPTZ,
    escalation_reason TEXT,
    assigned_agent_id UUID,
    move_in_date DATE,
    unit_preference TEXT,
    lead_score INT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Messages
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id),
    role TEXT NOT NULL,  -- user, assistant, system
    content TEXT NOT NULL,
    channel TEXT NOT NULL,
    tokens_used INT,
    llm_cost NUMERIC(10,6),
    confidence_score NUMERIC(3,2),
    tool_calls JSONB,  -- any tools the LLM invoked
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Escalations
CREATE TABLE escalations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id),
    reason TEXT NOT NULL,
    priority TEXT DEFAULT 'normal',  -- low, normal, high, urgent
    assigned_to UUID,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Users (property managers, leasing agents)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'agent',  -- admin, manager, agent
    phone TEXT,  -- for escalation notifications
    slack_webhook TEXT,
    properties UUID[],  -- array of property IDs they manage
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Tour Bookings (Phase 2)
CREATE TABLE tour_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id),
    property_id UUID REFERENCES properties(id),
    prospect_name TEXT,
    prospect_phone TEXT,
    prospect_email TEXT,
    tour_type TEXT,  -- in_person, self_guided, virtual
    scheduled_at TIMESTAMPTZ,
    duration_minutes INT DEFAULT 30,
    calendar_event_id TEXT,
    status TEXT DEFAULT 'confirmed',  -- confirmed, rescheduled, cancelled, completed
    agent_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_conversations_property ON conversations(property_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_external ON conversations(external_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at);
CREATE INDEX idx_escalations_resolved ON escalations(resolved_at) WHERE resolved_at IS NULL;
```

### 4.5 Webchat Widget Specification

```
Embeddable widget requirements:
├── Single <script> tag embed (like Intercom/Drift)
│   └── <script src="https://yourapp.com/widget.js" data-property="WIDGET_ID"></script>
├── Renders floating chat bubble (bottom-right corner)
├── Opens chat panel on click
├── WebSocket connection for real-time messaging
├── Stores session in localStorage for conversation continuity
├── Mobile responsive
├── Customizable:
│   ├── Brand color (primary color from property settings)
│   ├── Welcome message
│   ├── Bot name and avatar
│   └── Position (left/right)
├── Pre-chat form (optional):
│   ├── Name
│   ├── Email
│   └── "What are you looking for?" (dropdown: pricing, tour, general info)
└── Lightweight: < 50KB gzipped
```

### 4.6 SMS Architecture (Twilio)

```
INBOUND SMS FLOW:
1. Prospect texts property phone number
2. Twilio sends webhook POST to /api/webhooks/twilio/sms
3. Webhook handler:
   a. Verify Twilio signature (security)
   b. Look up property by Twilio phone number
   c. Look up or create conversation by prospect phone
   d. Enqueue message for processing
4. Conversation engine processes (see 4.3)
5. Response sent via Twilio API
6. Delivery status tracked via Twilio status callback

OUTBOUND SMS (Follow-ups, Phase 2):
1. Scheduled job checks for pending follow-ups
2. Verify prospect hasn't opted out (STOP list)
3. Generate follow-up message via LLM
4. Send via Twilio
5. Track delivery status

COMPLIANCE:
- Maintain opt-out list (STOP, UNSUBSCRIBE, CANCEL, END, QUIT)
- Include opt-out instructions in first message
- Respect quiet hours (no messages before 8am or after 9pm local time)
- Log all consent records
```

### 4.7 Email Architecture (Phase 2)

```
INBOUND EMAIL FLOW:
1. Property email (e.g., leasing@propertyname.com) configured with SendGrid Inbound Parse
2. SendGrid forwards parsed email to /api/webhooks/sendgrid/inbound
3. Extract: from, subject, body (strip signatures/quoted text)
4. Match to existing conversation or create new
5. Process through conversation engine
6. Send reply via SendGrid with:
   - Same subject line (Re: ...)
   - Professional HTML email template
   - Property branding (logo, colors)
   - Agent signature block

PARSING CHALLENGES:
- Strip email signatures (use library like mailstrip)
- Handle quoted/forwarded text
- Extract relevant content from HTML emails
- Handle attachments (store in S3, note in conversation)
```

### 4.8 Voice / IVR Architecture (Phase 3)

```
INBOUND CALL FLOW:
1. Prospect calls property phone number
2. Twilio routes to TwiML webhook
3. Initial greeting: "Thanks for calling [Property Name]. 
   I'm an AI assistant and can help with pricing, availability, 
   and scheduling tours. How can I help you?"
4. Speech-to-text (Twilio STT or Deepgram)
5. Process through conversation engine
6. Text-to-speech response (ElevenLabs or Twilio TTS)
7. Continue conversation loop
8. Escalation: transfer call to leasing office or send to voicemail

TECH OPTIONS:
- Twilio Voice + Twilio STT/TTS (simplest, all-in-one)
- Twilio Voice + Deepgram STT + ElevenLabs TTS (better quality)
- Vapi.ai or Bland.ai (managed voice AI platform — fastest to ship)

ESTIMATED COST PER CALL:
- Twilio voice: ~$0.013/min
- STT: ~$0.01/min (Deepgram)
- TTS: ~$0.01–0.03/min (ElevenLabs)
- LLM processing: ~$0.01/turn
- Total: ~$0.05–0.08/min → ~$0.25–0.40 per average 5-min call
```

---

## 5. API Design

### 5.1 Core API Endpoints

```
AUTHENTICATION
POST   /api/auth/login
POST   /api/auth/register
POST   /api/auth/refresh

PROPERTIES
GET    /api/properties                    # List properties for org
POST   /api/properties                    # Create property
GET    /api/properties/:id                # Get property details
PUT    /api/properties/:id                # Update property
DELETE /api/properties/:id                # Delete property

KNOWLEDGE BASE
GET    /api/properties/:id/knowledge      # Get all knowledge for property
PUT    /api/properties/:id/knowledge/:category  # Update category
POST   /api/properties/:id/knowledge/import     # Bulk import from doc

UNIT TYPES
GET    /api/properties/:id/units          # List unit types
POST   /api/properties/:id/units          # Create unit type
PUT    /api/properties/:id/units/:uid     # Update unit type
DELETE /api/properties/:id/units/:uid     # Delete unit type

CONVERSATIONS
GET    /api/conversations                 # List (filterable by property, status, date)
GET    /api/conversations/:id             # Get conversation with messages
POST   /api/conversations/:id/messages    # Agent sends message (human takeover)
PUT    /api/conversations/:id/escalate    # Manually escalate
PUT    /api/conversations/:id/close       # Close conversation
PUT    /api/conversations/:id/assign      # Assign to agent

ESCALATIONS
GET    /api/escalations                   # List open escalations
PUT    /api/escalations/:id/resolve       # Resolve escalation

TOUR BOOKINGS (Phase 2)
GET    /api/tours                         # List upcoming tours
POST   /api/tours                         # Manually book tour
PUT    /api/tours/:id                     # Update tour
DELETE /api/tours/:id                     # Cancel tour

ANALYTICS
GET    /api/analytics/overview            # Dashboard stats
GET    /api/analytics/conversations       # Conversation metrics
GET    /api/analytics/response-times      # Response time stats
GET    /api/analytics/top-questions       # Most common questions
GET    /api/analytics/conversion          # Lead conversion funnel

WEBHOOKS (Internal — called by Twilio/SendGrid)
POST   /api/webhooks/twilio/sms           # Inbound SMS
POST   /api/webhooks/twilio/sms/status    # SMS delivery status
POST   /api/webhooks/twilio/voice         # Inbound voice (Phase 3)
POST   /api/webhooks/sendgrid/inbound     # Inbound email (Phase 2)

WIDGET
POST   /api/widget/init                   # Initialize webchat session
WS     /api/widget/ws                     # WebSocket for real-time chat
```

### 5.2 Webhook Payload Examples

```json
// Normalized inbound message (internal format after channel parsing)
{
  "id": "msg_abc123",
  "conversation_id": "conv_xyz789",
  "property_id": "prop_456",
  "channel": "sms",
  "from": "+15551234567",
  "body": "Hi, do you allow dogs? I have a 60lb golden retriever",
  "received_at": "2026-04-04T14:30:00Z",
  "metadata": {
    "twilio_sid": "SM...",
    "media_urls": []
  }
}
```

```json
// AI response (internal format before channel-specific formatting)
{
  "conversation_id": "conv_xyz789",
  "content": "Great news — we are dog-friendly! We welcome dogs up to 75 lbs, so your golden retriever would be right at home. There's a one-time pet deposit of $300 and $35/month pet rent. We also have a dog park on-site! Would you like to schedule a tour to check out the community?",
  "confidence": 0.95,
  "intent": "pet_policy_inquiry",
  "tools_used": [],
  "escalate": false,
  "tokens": { "input": 1847, "output": 89, "cost": 0.0062 }
}
```

---

## 6. Infrastructure & DevOps

### 6.1 Hosting Architecture (MVP)

```
MVP Stack (Railway / Render):
├── Web Server (Node.js API + Next.js dashboard)
│   └── 1 instance, auto-scaling to 3
├── Worker (BullMQ message processor)
│   └── 1 instance, auto-scaling to 3
├── PostgreSQL (managed)
│   └── 1 instance, daily backups
├── Redis (managed)
│   └── 1 instance (queue + cache + sessions)
└── CDN (Cloudflare)
    └── Widget JS, dashboard static assets
```

### 6.2 Environment Variables

```bash
# LLM
ANTHROPIC_API_KEY=sk-ant-...
LLM_MODEL=claude-sonnet-4-20250514
LLM_MAX_TOKENS=300
LLM_TEMPERATURE=0.3

# Twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WEBHOOK_URL=https://api.yourapp.com/api/webhooks/twilio/sms

# SendGrid
SENDGRID_API_KEY=SG...
SENDGRID_INBOUND_WEBHOOK=https://api.yourapp.com/api/webhooks/sendgrid/inbound

# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname
REDIS_URL=redis://...

# Auth
JWT_SECRET=...
CLERK_SECRET_KEY=sk_...

# Monitoring
SENTRY_DSN=https://...
POSTHOG_API_KEY=phc_...

# App
APP_URL=https://app.yourapp.com
WIDGET_URL=https://widget.yourapp.com
API_URL=https://api.yourapp.com
```

### 6.3 Estimated Monthly Infrastructure Costs (MVP)

| Service | Cost |
|---|---|
| Railway/Render (API + Worker + DB + Redis) | $40–80 |
| Twilio (SMS — ~2,000 messages) | $30–50 |
| Twilio (phone number — 1 number) | $1.15 |
| SendGrid (email — free tier up to 100/day) | $0 |
| Cloudflare (CDN + DNS) | $0 |
| Anthropic Claude API (~2,500 conversations) | $75–125 |
| Sentry (free tier) | $0 |
| Domain + SSL | $15/yr |
| **Total for first property** | **~$150–260/mo** |

At $3–5/unit/month for a 200-unit property ($600–1,000/mo revenue), margins are strong from day one.

---

## 7. Safety & Compliance

### 7.1 Fair Housing Compliance

The AI must NEVER:
- Reference race, color, national origin, religion, sex, familial status, or disability in any way that could be discriminatory
- Steer prospects toward or away from specific units/areas based on protected characteristics
- Make assumptions about prospects based on their name, accent, or communication style
- Deny information about availability or pricing to any prospect
- Use language like "family-friendly" or "quiet community" that could imply preferences

Implementation:
- Include explicit fair housing guardrails in the system prompt
- Maintain a blocklist of potentially discriminatory phrases
- Log and flag any conversation where the AI's response touches on protected classes
- Quarterly audit of conversation logs for compliance

### 7.2 TCPA Compliance (SMS)

- Obtain express written consent before sending any outbound SMS
- Honor STOP/opt-out requests immediately (within same message session)
- Maintain do-not-contact list
- Include property identification in messages
- Respect quiet hours (8am–9pm local time)
- Keep consent records for 5 years

### 7.3 Data Privacy

- Conversation data retained for configurable period (default: 12 months)
- Prospect can request data deletion (manual process initially)
- No conversation data used to train models (Anthropic API doesn't train on API inputs)
- PII redacted from analytics/reporting dashboards
- Database access restricted by role

---

## 8. Development Roadmap

### Phase 1: MVP (Weeks 1–6) — Target: 1 Pilot Property

**Week 1–2: Foundation**
- [ ] Project setup (monorepo: API + dashboard + widget)
- [ ] Database schema + migrations
- [ ] Auth system (Clerk integration)
- [ ] Property CRUD + knowledge base management

**Week 3–4: Core AI**
- [ ] Twilio SMS integration (inbound/outbound)
- [ ] Conversation engine + Claude API integration
- [ ] System prompt builder with property context injection
- [ ] Escalation detection and agent notification
- [ ] TCPA compliance (opt-out handling)

**Week 5–6: Dashboard + Widget**
- [ ] Webchat widget (React, embeddable)
- [ ] Admin dashboard (conversation viewer, property config)
- [ ] Basic analytics (conversation count, response time)
- [ ] Testing with simulated conversations
- [ ] Deploy to pilot property

**Phase 1 Deliverables:**
- AI answers prospect questions via SMS and webchat
- Property manager configures knowledge base via dashboard
- Escalation to human when needed
- Conversation logs viewable in dashboard

### Phase 2: Growth Features (Weeks 7–16)

- [ ] Email channel (SendGrid inbound parse)
- [ ] Tour scheduling (Google Calendar API)
- [ ] Automated follow-up sequences
- [ ] Multi-property support
- [ ] Enhanced analytics (conversion funnel, top questions, lead scoring)
- [ ] Agent mobile notifications
- [ ] Conversation assignment / team inbox
- [ ] Onboarding wizard for new properties

### Phase 3: Scale (Weeks 17–30)

- [ ] Voice/IVR channel (Twilio Voice or Vapi)
- [ ] PMS integration (AppFolio or Entrata API)
- [ ] Maintenance request intake and routing
- [ ] Delinquency / rent reminder outreach
- [ ] Renewal conversation automation
- [ ] API for third-party integrations
- [ ] White-label / custom branding per org
- [ ] SOC 2 Type II preparation

---

## 9. Go-to-Market Strategy

### Target Customer

- Independent operators and regional management companies
- Portfolio size: 50–500 units
- Currently using: answering services ($200–500/mo), missed calls, or manual leasing only
- Pain point: losing leads after hours, slow response times, overwhelmed leasing teams

### Pricing Model

| Plan | Price | Includes |
|---|---|---|
| **Starter** | $3/unit/month (min $150/mo) | SMS + webchat, 1 property, basic dashboard |
| **Growth** | $4/unit/month (min $200/mo) | + Email, tour scheduling, follow-ups, 5 properties |
| **Scale** | $5/unit/month (min $500/mo) | + Voice, PMS integration, unlimited properties, priority support |

### Competitive Positioning

> "EliseAI for the rest of us — enterprise-grade AI leasing assistant without the enterprise price tag or 6-month implementation."

Key differentiators vs. EliseAI:
1. **Transparent pricing** — published on website, no demo required
2. **Self-serve onboarding** — live in 1 day, not 1 month
3. **No long-term contracts** — month-to-month
4. **Better human handoff** — immediate transfer when prospect asks, no AI insistence
5. **Modern AI** — built on latest LLM technology vs. legacy NLP

### Early Traction Plan

1. **Pilot with 1–3 local properties** (Gulf Breeze / Pensacola area) at discounted or free rate
2. **Collect metrics:** lead response time improvement, after-hours capture rate, tours booked
3. **Build case studies** from pilot data
4. **Outbound to property managers** via LinkedIn, local apartment associations
5. **Content marketing:** blog posts comparing AI answering services, cost calculators
6. **Partner with property management consultants** for referrals

---

## 10. Key Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| AI gives incorrect property info | Prospect confusion, lost leads | Structured knowledge base with validation; confidence scoring; regular audits |
| Fair housing violation | Legal liability | Explicit guardrails in system prompt; quarterly conversation audits; legal review of prompts |
| TCPA violation (SMS) | Fines up to $1,500/message | Built-in opt-out handling; consent tracking; quiet hours enforcement |
| LLM costs spike unexpectedly | Margin erosion | Token budgets per conversation; model fallback (Haiku for simple queries); caching common Q&A |
| Twilio outage | Service disruption | Fallback to email notifications; status page monitoring |
| PMS API changes (Phase 3) | Integration breaks | Abstract PMS layer; automated integration tests; version monitoring |
| Competitor undercuts on price | Customer churn | Focus on UX and onboarding speed as differentiators, not just price |

---

## 11. Success Metrics

### Product Metrics

- **Response time:** < 5 seconds (text), < 10 seconds (email)
- **Automation rate:** 85%+ of conversations handled without human intervention
- **Escalation rate:** < 15% of conversations
- **Tour booking rate:** 20%+ of qualified conversations result in a scheduled tour
- **Lead capture rate:** 90%+ of after-hours inquiries get an immediate response

### Business Metrics

- **MRR growth:** Target $10K MRR within 6 months of launch
- **Customer acquisition cost:** < $500 per property
- **Churn rate:** < 5% monthly
- **Net revenue retention:** > 110% (upsells from Starter → Growth → Scale)
- **Payback period:** < 3 months per customer

---

## 12. Open Questions & Decisions Needed

1. **Brand name & domain** — needs to be memorable, available, and property-management adjacent
2. **Solo founder vs. co-founder** — voice/IVR and PMS integration are heavy lifts; consider a technical co-founder or contractor
3. **Pilot property sourcing** — who are the first 1–3 properties to test with?
4. **Legal review** — fair housing compliance review of system prompts before launch
5. **Voice channel build vs. buy** — build custom on Twilio vs. use Vapi/Bland.ai managed platform?
6. **PMS integration priority** — which PMS to integrate first? (AppFolio has better API docs; Yardi/RealPage have more market share)
7. **LLC / business entity** — formation, business insurance, terms of service

---

*Last updated: April 4, 2026*
