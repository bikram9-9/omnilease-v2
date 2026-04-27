import type { EscalationPriority } from '@omnilease/db';
import type { PropertyContextSection } from '@/lib/property-context';

export type CapturedProspectDetails = {
  prospectName: string | null;
  prospectEmail: string | null;
  prospectPhone: string | null;
  moveInDate: string | Date | null;
  unitPreference: string | null;
};

export type AnswerSourceEvidence = {
  activeUnitCount: number;
  hasPricingData: boolean;
  hasAvailabilityData: boolean;
  hasFeePolicyContext: boolean;
  hasApplicationContext: boolean;
  hasStructuredQuoteData: boolean;
  hasFloorplanContext: boolean;
  hasTourTools: boolean;
};

export type AnswerQualityGuardrail = {
  category:
    | 'unsupported_application'
    | 'unsupported_fee'
    | 'unsupported_quote'
    | 'floorplan_ambiguity'
    | 'repeated_captured_detail';
  reason: string;
  priority: EscalationPriority;
  notice: string;
  confidence: number;
};

const HUMAN_NOTICE = [
  "I don't want to guess on that.",
  'A leasing specialist has been alerted and will follow up with the right details.',
].join(' ');

const fieldQuestionPatterns: Array<{
  field: keyof CapturedProspectDetails;
  label: string;
  patterns: RegExp[];
}> = [
  {
    field: 'prospectName',
    label: 'name',
    patterns: [
      /\bwhat(?:'s| is) your name\b/i,
      /\bcan i get your name\b/i,
      /\bmay i have your name\b/i,
    ],
  },
  {
    field: 'prospectEmail',
    label: 'email',
    patterns: [
      /\bwhat(?:'s| is) your email\b/i,
      /\bemail address\b/i,
      /\bcan i get your email\b/i,
    ],
  },
  {
    field: 'prospectPhone',
    label: 'phone number',
    patterns: [
      /\bwhat(?:'s| is) your phone\b/i,
      /\bphone number\b/i,
      /\bcan i get your phone\b/i,
    ],
  },
  {
    field: 'moveInDate',
    label: 'move-in date',
    patterns: [
      /\bmove[-\s]?in date\b/i,
      /\bwhen (?:are|would) you (?:looking|hoping|planning) to move\b/i,
      /\bwhen do you want to move\b/i,
    ],
  },
  {
    field: 'unitPreference',
    label: 'unit preference',
    patterns: [
      /\bwhat (?:floor plan|floorplan|unit|bedroom count)\b/i,
      /\bwhich (?:floor plan|floorplan|unit)\b/i,
      /\bwhat type of (?:unit|apartment)\b/i,
    ],
  },
];

export function buildAnswerSourceEvidence(input: {
  activeUnitCount: number;
  contextSections: PropertyContextSection[];
  hasStructuredQuoteData?: boolean;
  hasStructuredApplicationData?: boolean;
  hasStructuredFeeData?: boolean;
}): AnswerSourceEvidence {
  const contextText = input.contextSections.map((section) => section.body).join('\n').toLowerCase();
  const hasFeePolicyContext = input.hasStructuredFeeData === true
    || /\b(fee|fees|deposit|admin fee|application fee|screening fee|pet rent)\b/i.test(contextText);
  const hasApplicationContext = input.hasStructuredApplicationData === true
    || /\b(apply|application|screening|qualification|income|credit check)\b/i.test(contextText);
  const hasFloorplanContext = /\b(floor\s*plan|floorplan|sqft|square feet|bedroom|bathroom)\b/i.test(contextText)
    || input.activeUnitCount > 0;

  return {
    activeUnitCount: input.activeUnitCount,
    hasPricingData: input.activeUnitCount > 0,
    hasAvailabilityData: input.activeUnitCount > 0,
    hasFeePolicyContext,
    hasApplicationContext,
    hasStructuredQuoteData: input.hasStructuredQuoteData === true,
    hasFloorplanContext,
    hasTourTools: true,
  };
}

export function renderCapturedProspectMemory(details: CapturedProspectDetails): string {
  const lines = [
    details.prospectName ? `- Name: ${details.prospectName}` : null,
    details.prospectEmail ? `- Email: ${details.prospectEmail}` : null,
    details.prospectPhone ? `- Phone: ${details.prospectPhone}` : null,
    details.moveInDate ? `- Move-in date: ${formatCapturedDate(details.moveInDate)}` : null,
    details.unitPreference ? `- Unit preference: ${details.unitPreference}` : null,
  ].filter(Boolean);

  if (lines.length === 0) {
    return [
      'KNOWN PROSPECT DETAILS',
      '- No prospect details have been captured yet.',
      '- Ask only for details needed for the next concrete step.',
    ].join('\n');
  }

  return [
    'KNOWN PROSPECT DETAILS',
    ...lines,
    '- Do not ask again for any detail listed above unless the prospect explicitly gives conflicting information or asks to change it.',
  ].join('\n');
}

export function renderAnswerSourceRules(evidence: AnswerSourceEvidence): string {
  const facts = [
    `- Pricing/availability source: ${evidence.hasPricingData ? 'structured unit inventory is available' : 'no structured unit inventory is available'}.`,
    `- Fee source: ${evidence.hasFeePolicyContext ? 'published policy context mentions fees/deposits' : 'no published fee/application-fee source is available'}.`,
    `- Application source: ${evidence.hasApplicationContext ? 'published application context is available' : 'no structured application link, criteria, or fee source is available yet'}.`,
    `- Quote source: ${evidence.hasStructuredQuoteData ? 'structured quote and fee data is available through get_quote' : 'no structured quote tool data is available yet'}.`,
    `- Floorplan source: ${evidence.hasFloorplanContext ? 'unit/floorplan context is available' : 'no floorplan source is available'}.`,
    `- Tour source: ${evidence.hasTourTools ? 'tour tools must be used for exact slots' : 'no tour slot source is available'}.`,
  ];

  return [
    'ANSWER QUALITY SOURCE RULES',
    ...facts,
    '- For pricing, fees, availability, tours, application, and floorplan answers, use only the listed source of truth.',
    '- If the requested source is missing, stale, ambiguous, or not tool-backed, say you do not want to guess and call escalate_to_human.',
    '- Never invent total move-in costs, specials, application fees, screening criteria, links, available units, or floorplan recommendations.',
  ].join('\n');
}

export function classifyUnsupportedWorkflow(
  text: string,
  evidence: AnswerSourceEvidence,
): AnswerQualityGuardrail | null {
  const normalized = text.trim();
  if (!normalized) return null;

  if (
    /\b(quote|written quote|total move[-\s]?in|out[-\s]?the[-\s]?door|all[-\s]?in cost)\b/i.test(normalized)
    && !evidence.hasStructuredQuoteData
  ) {
    return makeGuardrail('unsupported_quote', 'Quote or total-cost request lacks structured quote data');
  }

  if (
    /\b(application fee|admin fee|screening fee|move[-\s]?in fee|all fees|hidden fees|fee breakdown)\b/i.test(normalized)
    && !evidence.hasFeePolicyContext
  ) {
    return makeGuardrail('unsupported_fee', 'Fee request lacks published fee source data');
  }

  if (
    /\b(apply|application|screening|qualification|income requirement|credit check|application link)\b/i.test(normalized)
    && !evidence.hasApplicationContext
  ) {
    return makeGuardrail('unsupported_application', 'Application request lacks structured application source data');
  }

  if (
    /\b(best|recommend|which|what)\b.*\b(floor\s*plan|floorplan|unit|apartment)\b/i.test(normalized)
    && !hasConcreteUnitPreference(normalized)
  ) {
    return makeGuardrail('floorplan_ambiguity', 'Floorplan request is ambiguous and needs human review');
  }

  if (/\b(floor\s*plan|floorplan)\b/i.test(normalized) && !evidence.hasFloorplanContext) {
    return makeGuardrail('floorplan_ambiguity', 'Floorplan request lacks floorplan source data');
  }

  return null;
}

export function detectRepeatedCapturedDetailQuestion(
  assistantText: string,
  details: CapturedProspectDetails,
): AnswerQualityGuardrail | null {
  const hit = fieldQuestionPatterns.find((entry) => {
    const captured = details[entry.field];
    return Boolean(captured) && entry.patterns.some((pattern) => pattern.test(assistantText));
  });

  if (!hit) return null;

  return {
    category: 'repeated_captured_detail',
    reason: `Assistant attempted to re-ask for captured prospect ${hit.label}`,
    priority: 'normal',
    notice: [
      `I already have your ${hit.label}.`,
      'A leasing specialist has been alerted so we do not keep repeating questions.',
    ].join(' '),
    confidence: 0.2,
  };
}

export function getAnswerQualityMetadata(guardrail: AnswerQualityGuardrail) {
  return {
    answerQuality: {
      category: guardrail.category,
      reason: guardrail.reason,
      confidence: guardrail.confidence,
      routedToHuman: true,
    },
  };
}

function makeGuardrail(
  category: AnswerQualityGuardrail['category'],
  reason: string,
): AnswerQualityGuardrail {
  return {
    category,
    reason,
    priority: 'normal',
    notice: HUMAN_NOTICE,
    confidence: 0.2,
  };
}

function hasConcreteUnitPreference(text: string): boolean {
  return /\b(studio|one[-\s]?bed|1\s*bed|two[-\s]?bed|2\s*bed|three[-\s]?bed|3\s*bed|\d+\s*br)\b/i.test(text);
}

function formatCapturedDate(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}
