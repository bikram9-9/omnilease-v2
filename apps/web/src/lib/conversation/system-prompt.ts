import type { OfficeHours } from '@omnilease/db';
import type { AssistantSettingsInput } from '@/lib/assistant-settings';
import { renderAssistantSettingsForPrompt } from '@/lib/assistant-settings';
import type { PropertyContextSection } from '@/lib/property-context';

export type SystemPromptProperty = {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  timezone: string;
  officeHours: OfficeHours | null;
  welcomeMessage: string | null;
};

export type SystemPromptUnitType = {
  name: string;
  bedrooms: number;
  bathrooms: string;  // drizzle numeric comes back as string
  sqftMin: number | null;
  sqftMax: number | null;
  priceMin: string | null;
  priceMax: string | null;
  availableCount: number;
  deposit: string | null;
  description: string | null;
  isActive: boolean;
};

export type SystemPromptInput = {
  property: SystemPromptProperty;
  unitTypes: SystemPromptUnitType[];
  contextSections: PropertyContextSection[];
  assistantSettings?: (AssistantSettingsInput & { version: number }) | null;
};

function money(n: string | null): string {
  if (!n) return '—';
  const num = Number(n);
  if (Number.isNaN(num)) return n;
  return `$${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function sqftRange(u: SystemPromptUnitType): string {
  if (u.sqftMin && u.sqftMax) return `${u.sqftMin}–${u.sqftMax} sqft`;
  if (u.sqftMin) return `${u.sqftMin}+ sqft`;
  return '';
}

function unitTypeLine(u: SystemPromptUnitType): string {
  const range = sqftRange(u);
  const price = `${money(u.priceMin)}–${money(u.priceMax)}/mo`;
  const parts = [
    `${u.name} (${u.bedrooms} bed / ${u.bathrooms} bath)`,
    range,
    price,
    `${u.availableCount} available`,
  ].filter(Boolean);
  return `- ${parts.join(', ')}`;
}

function renderContextSection(section: PropertyContextSection): string {
  return `### ${section.title}\n${section.body}`;
}

export function buildSystemPrompt(input: SystemPromptInput): string {
  const { property, unitTypes, contextSections, assistantSettings } = input;
  const activeUnits = unitTypes.filter((u) => u.isActive);

  const sections: string[] = [];

  sections.push(
    [
      'You are a leasing assistant for a multifamily apartment community.',
      'Your job is to answer prospect questions about the property, collect their',
      'contact info when appropriate, and help them schedule a tour.',
      '',
      'Tone: warm, concise, professional. Sound like a helpful human leasing agent,',
      'not a chatbot. Never use generic AI-assistant phrasing like "As an AI…".',
    ].join('\n'),
  );

  sections.push(
    [
      'FAIR HOUSING RULES (critical — violation is a legal liability):',
      '- Never reference race, color, national origin, religion, sex, familial status, or disability.',
      '- Never steer prospects toward or away from units or areas based on personal characteristics.',
      '- Never use phrases like "family-friendly", "quiet community", "safe area", or "good schools".',
      '- Treat every prospect with the same information and the same tone.',
      '- If a question touches protected class topics, call escalate_to_human.',
    ].join('\n'),
  );

  if (assistantSettings) {
    sections.push(renderAssistantSettingsForPrompt(assistantSettings));
  }

  const addr = [property.address, property.city, property.state].filter(Boolean).join(', ');
  sections.push(
    [
      `PROPERTY`,
      `Name: ${property.name}`,
      addr ? `Address: ${addr}` : '',
      `Timezone: ${property.timezone}`,
      property.officeHours ? `Office hours: ${JSON.stringify(property.officeHours)}` : '',
      property.welcomeMessage ? `Greeting: ${property.welcomeMessage}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );

  if (activeUnits.length > 0) {
    sections.push(
      ['UNIT TYPES', ...activeUnits.map(unitTypeLine)].join('\n'),
    );
  }

  if (contextSections.length > 0) {
    sections.push(
      ['PROPERTY CONTEXT (markdown source of truth)', ...contextSections.map(renderContextSection)].join('\n\n'),
    );
  }

  sections.push(
    [
      'AVAILABLE ACTIONS',
      '- Answer questions using only the context above. Never invent pricing, availability, or policies that are not in the markdown context or unit inventory.',
      '- Call collect_prospect_info when you learn the prospect\'s name, email, phone, move-in date, or unit preference.',
      '- Call check_availability to narrow unit options by bedrooms or max price.',
      '- Call escalate_to_human when the prospect asks for a human, matches an operator-configured escalation trigger, asks any fair housing / legal / complaint / pricing negotiation question, or if you don\'t have enough context to answer confidently.',
    ].join('\n'),
  );

  sections.push(
    [
      'RESPONSE FORMAT',
      '- Keep replies concise for Messenger and website chat. Most responses should stay within 2-4 sentences.',
      '- Reference the property by name naturally — not every message.',
      '- End with a soft CTA that moves the lead toward a tour when appropriate.',
      '- Never repeat the prospect\'s question back to them.',
    ].join('\n'),
  );

  return sections.join('\n\n');
}
