import type { EscalationPriority } from '@omnilease/db';

export type EscalationCategory =
  | 'human_request'
  | 'emergency'
  | 'complaint'
  | 'legal_privacy'
  | 'billing_payment'
  | 'application_blocked'
  | 'sensitive_unsupported';

export type EscalationTrigger = {
  category: EscalationCategory;
  priority: EscalationPriority;
  reason: string;
  notice: string;
};

const EMERGENCY_NOTICE = [
  'If this is an emergency, call 911 or your property emergency maintenance line now.',
  'A leasing specialist has been alerted and will follow up as soon as possible.',
].join(' ');

const HUMAN_NOTICE = 'A leasing specialist has been alerted and will follow up soon.';

const ESCALATION_PATTERNS: Array<{
  category: EscalationCategory;
  priority: EscalationPriority;
  reason: string;
  notice: string;
  patterns: RegExp[];
}> = [
  {
    category: 'emergency',
    priority: 'urgent',
    reason: 'Emergency or urgent maintenance request',
    notice: EMERGENCY_NOTICE,
    patterns: [
      /\b(emergency|urgent|asap|right now|immediately)\b/i,
      /\b(fire|smoke|flood|flooding|gas leak|carbon monoxide)\b/i,
      /\b(water leak|burst pipe|sewage|electrical hazard|no heat|broken lock)\b/i,
      /\b(maintenance emergency|emergency maintenance|after[-\s]?hours maintenance)\b/i,
      /\b(safety issue|unsafe|break[-\s]?in|intruder)\b/i,
    ],
  },
  {
    category: 'human_request',
    priority: 'high',
    reason: 'Prospect requested a human representative',
    notice: HUMAN_NOTICE,
    patterns: [
      /\b(real person|human|representative|agent|leasing agent|someone from the office)\b/i,
      /\b(manager|supervisor|property manager|leasing office)\b/i,
      /\b(call me|can someone call|speak (with|to) someone|talk (with|to) someone)\b/i,
      /\b(stop (the )?(bot|ai)|no more (bot|ai)|not (a )?bot)\b/i,
    ],
  },
  {
    category: 'legal_privacy',
    priority: 'high',
    reason: 'Legal or privacy concern requires human review',
    notice: HUMAN_NOTICE,
    patterns: [
      /\b(legal|lawyer|attorney|sue|lawsuit|court|rights|lease clause)\b/i,
      /\b(privacy|personal data|delete my data|data request|consent|do not sell)\b/i,
    ],
  },
  {
    category: 'billing_payment',
    priority: 'high',
    reason: 'Billing or payment issue requires human review',
    notice: HUMAN_NOTICE,
    patterns: [
      /\b(billing|payment|charged|charge|ledger|balance|rent portal)\b/i,
      /\b(late fee|refund|deposit dispute|overcharged|wrong amount|payment failed)\b/i,
      /\b(cannot pay|can't pay|rent payment|autopay|money order)\b/i,
    ],
  },
  {
    category: 'application_blocked',
    priority: 'high',
    reason: 'Application-blocking issue requires human review',
    notice: HUMAN_NOTICE,
    patterns: [
      /\b(application|apply|applying|screening|approval|approved|denied)\b.*\b(stuck|blocked|broken|error|won't work|cannot|can't|unable)\b/i,
      /\b(can't submit|cannot submit|unable to submit|portal won't work|portal is down)\b/i,
      /\b(application fee|screening fee|application status)\b/i,
    ],
  },
  {
    category: 'complaint',
    priority: 'high',
    reason: 'Complaint or dissatisfaction requires human review',
    notice: HUMAN_NOTICE,
    patterns: [
      /\b(complain|complaint|unacceptable|angry|upset|frustrated)\b/i,
      /\b(awful|terrible|horrible|ridiculous|scam|bait and switch)\b/i,
    ],
  },
  {
    category: 'sensitive_unsupported',
    priority: 'normal',
    reason: 'Sensitive or unsupported workflow requires human review',
    notice: HUMAN_NOTICE,
    patterns: [
      /\b(eviction|reasonable accommodation|disability accommodation|domestic violence)\b/i,
      /\b(police report|restraining order|harassment|threatened)\b/i,
    ],
  },
];

export function classifyEscalationTrigger(text: string): EscalationTrigger | null {
  const normalized = text.trim();
  if (!normalized) return null;

  const match = ESCALATION_PATTERNS.find((entry) =>
    entry.patterns.some((pattern) => pattern.test(normalized)),
  );
  if (!match) return null;

  return {
    category: match.category,
    priority: match.priority,
    reason: match.reason,
    notice: match.notice,
  };
}
