import type { FeeLineItem, OfficeHours } from '@omnilease/db';
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
  applicationUrl: string | null;
  applicationFee: string | null;
  quoteDisclaimer: string | null;
  leasingSpecials: string | null;
  recurringFees: FeeLineItem[];
  oneTimeFees: FeeLineItem[];
  petFees: FeeLineItem[];
  parkingFees: FeeLineItem[];
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
  recurringFees: FeeLineItem[];
  oneTimeFees: FeeLineItem[];
  specials: string | null;
  quoteDisclaimer: string | null;
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

function feeSummary(label: string, fees: FeeLineItem[]): string | null {
  if (fees.length === 0) return null;
  const rendered = fees.map((fee) => (
    `${fee.label}: ${money(String(fee.amount))}${fee.required === false ? ' optional' : ''}`
  )).join('; ');
  return `${label}: ${rendered}`;
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

  sections.push(
    [
      'QUOTE AND APPLICATION MVP',
      property.applicationUrl ? `Application link: ${property.applicationUrl}` : 'Application link: not configured',
      property.applicationFee ? `Application fee: ${money(property.applicationFee)}` : 'Application fee: not configured',
      feeSummary('Property monthly fees', property.recurringFees),
      feeSummary('Property one-time fees', property.oneTimeFees),
      feeSummary('Pet fees', property.petFees),
      feeSummary('Parking fees', property.parkingFees),
      property.leasingSpecials ? `Leasing specials: ${property.leasingSpecials}` : null,
      property.quoteDisclaimer ? `Quote disclaimer: ${property.quoteDisclaimer}` : null,
      'Use get_quote before giving estimated monthly totals, move-in fee totals, or application links.',
      'This is an MVP estimate, not jurisdiction-aware fee transparency.',
    ].filter(Boolean).join('\n'),
  );

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
      '- Call get_quote before answering total-cost, fee breakdown, deposit, special, or application-link questions.',
      '- If get_quote reports missing rent, fees, application link, or disclaimer data, say the estimate is incomplete and call escalate_to_human when the prospect needs a firm quote.',
      '- Call get_tour_slots before offering exact tour times. Offer only slots returned by the tool.',
      '- Before calling book_tour, collect the prospect\'s name and at least one contact method: email or phone.',
      '- Call book_tour only after the prospect chooses a specific returned slot. If booking fails because the slot is stale or unavailable, apologize briefly and offer another returned slot.',
      '- Call reschedule_tour or cancel_tour when the prospect asks to move or cancel an existing booked tour.',
      '- Call escalate_to_human when the prospect asks for a human, representative, manager, or supervisor.',
      '- Call escalate_to_human for emergency, urgent, maintenance emergency, complaint, legal, privacy, billing/payment, application-blocking, fair housing, pricing negotiation, or unsupported sensitive workflows.',
      '- After escalation, do not continue qualification, tour booking, or repetitive follow-up questions.',
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
