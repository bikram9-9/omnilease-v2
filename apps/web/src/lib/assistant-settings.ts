import { z } from 'zod';
import type { PropertyAssistantSettings } from '@omnilease/db';

export const ASSISTANT_SETTINGS_PROMPT_VERSION = 'phase-a-assistant-settings-v1';

export const defaultScreeningQuestions = [
  'What move-in timeframe are you hoping for?',
  'What floor plan or bedroom count are you looking for?',
  'What is the best email or phone number for follow-up?',
];

export const defaultSellingPoints = [
  'Use only verified property amenities, unit inventory, and knowledge sections.',
  'Offer to connect the prospect with the leasing team when exact details are unavailable.',
];

export const defaultEscalationTriggers = [
  'explicit human request',
  'fair housing or protected-class topic',
  'legal or lease interpretation',
  'accommodation request',
  'angry or complaint language',
  'pricing negotiation',
  'missing or conflicting property knowledge',
];

export const assistantSettingsSchema = z.object({
  primaryGoal: z.enum(['answer_questions', 'qualify_lead', 'book_tour', 'route_to_human']),
  tone: z.enum(['warm_professional', 'concise_direct', 'luxury_concierge', 'friendly_casual']),
  ctaPreference: z.enum(['ask_for_tour', 'ask_for_contact', 'offer_human', 'answer_only']),
  screeningQuestions: z.array(z.string().trim().min(1)).max(12),
  sellingPoints: z.array(z.string().trim().min(1)).max(12),
  escalationTriggers: z.array(z.string().trim().min(1)).max(20),
});

export type AssistantSettingsInput = z.infer<typeof assistantSettingsSchema>;

export const defaultAssistantSettings: AssistantSettingsInput = {
  primaryGoal: 'book_tour',
  tone: 'warm_professional',
  ctaPreference: 'ask_for_tour',
  screeningQuestions: defaultScreeningQuestions,
  sellingPoints: defaultSellingPoints,
  escalationTriggers: defaultEscalationTriggers,
};

export function splitLines(value: FormDataEntryValue | null): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parseAssistantSettingsForm(formData: FormData): AssistantSettingsInput {
  return assistantSettingsSchema.parse({
    primaryGoal: formData.get('primaryGoal'),
    tone: formData.get('tone'),
    ctaPreference: formData.get('ctaPreference'),
    screeningQuestions: splitLines(formData.get('screeningQuestions')),
    sellingPoints: splitLines(formData.get('sellingPoints')),
    escalationTriggers: splitLines(formData.get('escalationTriggers')),
  });
}

export function normalizeAssistantSettings(
  row: PropertyAssistantSettings | null | undefined,
): AssistantSettingsInput & { version: number } {
  if (!row) return { ...defaultAssistantSettings, version: 1 };

  const parsed = assistantSettingsSchema.safeParse({
    primaryGoal: row.primaryGoal,
    tone: row.tone,
    ctaPreference: row.ctaPreference,
    screeningQuestions: row.screeningQuestions,
    sellingPoints: row.sellingPoints,
    escalationTriggers: row.escalationTriggers,
  });

  if (!parsed.success) {
    return { ...defaultAssistantSettings, version: row.version || 1 };
  }

  return { ...parsed.data, version: row.version };
}

export function renderAssistantSettingsForPrompt(settings: AssistantSettingsInput & { version: number }): string {
  const lines = [
    'ASSISTANT BEHAVIOR SETTINGS',
    `Settings version: ${settings.version}`,
    `Primary goal: ${settings.primaryGoal.replace(/_/g, ' ')}`,
    `Tone: ${settings.tone.replace(/_/g, ' ')}`,
    `CTA preference: ${settings.ctaPreference.replace(/_/g, ' ')}`,
    '',
    'Discovery questions to ask naturally when relevant:',
    ...settings.screeningQuestions.map((question) => `- ${question}`),
    '',
    'Approved selling points:',
    ...settings.sellingPoints.map((point) => `- ${point}`),
    '',
    'Operator-configured escalation triggers:',
    ...settings.escalationTriggers.map((trigger) => `- ${trigger}`),
    '',
    'These settings guide style and workflow only. Fair housing, legal, safety, and source-of-truth rules override them.',
  ];

  return lines.join('\n');
}
