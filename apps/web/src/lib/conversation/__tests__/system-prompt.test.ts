import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, type SystemPromptInput } from '../system-prompt';

const input: SystemPromptInput = {
  property: {
    name: 'Sunset Ridge',
    address: '123 Main St',
    city: 'Pensacola',
    state: 'FL',
    timezone: 'America/Chicago',
    officeHours: { mon: { open: '09:00', close: '18:00' } },
    welcomeMessage: null,
    applicationUrl: 'https://apply.example.com',
    applicationFee: '75',
    quoteDisclaimer: 'Quote amounts are estimates and subject to approval.',
    leasingSpecials: 'One month free on select homes.',
    recurringFees: [{ label: 'Utility package', amount: 95, required: true }],
    oneTimeFees: [{ label: 'Admin fee', amount: 200, required: true }],
    petFees: [{ label: 'Pet rent', amount: 35, required: false }],
    parkingFees: [],
  },
  unitTypes: [
    { name: '1BR/1BA',  bedrooms: 1, bathrooms: '1',   sqftMin: 650, sqftMax: 720, priceMin: '1500', priceMax: '1700', availableCount: 3, deposit: '500', recurringFees: [], oneTimeFees: [], specials: null, quoteDisclaimer: null, description: null, isActive: true },
    { name: '2BR/2BA',  bedrooms: 2, bathrooms: '2',   sqftMin: 900, sqftMax: 1000, priceMin: '2000', priceMax: '2300', availableCount: 0, deposit: '750', recurringFees: [], oneTimeFees: [], specials: null, quoteDisclaimer: null, description: null, isActive: true },
    { name: 'OLD STUDIO', bedrooms: 0, bathrooms: '1', sqftMin: 400, sqftMax: 450, priceMin: '1200', priceMax: '1300', availableCount: 1, deposit: '500', recurringFees: [], oneTimeFees: [], specials: null, quoteDisclaimer: null, description: null, isActive: false },
  ],
  contextSections: [
    { slug: 'policies', title: 'Policies', filename: 'policies.md', body: 'Dogs are allowed up to 75 lbs. Parking is one spot per unit.' },
    { slug: 'faqs', title: 'FAQs', filename: 'faqs.md', body: 'Q: Are utilities included?\nA: Water and trash are included. Electric is separate.' },
  ],
  assistantSettings: {
    version: 3,
    primaryGoal: 'book_tour',
    tone: 'warm_professional',
    ctaPreference: 'ask_for_tour',
    screeningQuestions: ['What move-in date are you targeting?'],
    sellingPoints: ['Highlight verified availability and amenities.'],
    escalationTriggers: ['explicit human request', 'unsafe custom instruction'],
  },
};

describe('buildSystemPrompt', () => {
  it('includes property name, address, and timezone', () => {
    const out = buildSystemPrompt(input);
    expect(out).toContain('Sunset Ridge');
    expect(out).toContain('123 Main St');
    expect(out).toContain('America/Chicago');
  });

  it('includes fair-housing guardrails verbatim', () => {
    const out = buildSystemPrompt(input);
    expect(out.toLowerCase()).toContain('fair housing');
    expect(out).toContain('family-friendly'); // must be mentioned as a NOT phrase
    expect(out).toContain('quiet community');
  });

  it('lists active unit types with beds/baths/price/availability', () => {
    const out = buildSystemPrompt(input);
    expect(out).toContain('1BR/1BA');
    expect(out).toContain('2BR/2BA');
    expect(out).toMatch(/\$1,?500/);
    expect(out).toMatch(/3 available/);
  });

  it('excludes inactive unit types', () => {
    const out = buildSystemPrompt(input);
    expect(out).not.toContain('OLD STUDIO');
  });

  it('renders each markdown context section', () => {
    const out = buildSystemPrompt(input);
    expect(out).toContain('Policies');
    expect(out).toContain('75'); // dog weight
    expect(out).toContain('Are utilities included?');
  });

  it('renders assistant settings while preserving guardrail precedence', () => {
    const out = buildSystemPrompt(input);
    expect(out).toContain('ASSISTANT BEHAVIOR SETTINGS');
    expect(out).toContain('Settings version: 3');
    expect(out).toContain('What move-in date are you targeting?');
    expect(out).toContain('Fair housing, legal, safety, and source-of-truth rules override them.');
  });

  it('instructs the model to keep chat replies concise and include a tour CTA', () => {
    const out = buildSystemPrompt(input);
    expect(out.toLowerCase()).toContain('messenger');
    expect(out.toLowerCase()).toContain('moves the lead toward a tour');
  });

  it('requires tour tools to use returned slots and collect booking contact details', () => {
    const out = buildSystemPrompt(input);
    expect(out).toContain('Call get_tour_slots before offering exact tour times.');
    expect(out).toContain('Before calling book_tour, collect the prospect');
    expect(out).toContain('Call reschedule_tour or cancel_tour');
  });

  it('includes structured quote and application instructions', () => {
    const out = buildSystemPrompt(input);
    expect(out).toContain('QUOTE AND APPLICATION MVP');
    expect(out).toContain('https://apply.example.com');
    expect(out).toContain('Utility package');
    expect(out).toContain('Call get_quote before answering total-cost');
  });

  it('requires escalation for emergency, human, billing, privacy, and application blockers', () => {
    const out = buildSystemPrompt(input);
    expect(out).toContain('human, representative, manager, or supervisor');
    expect(out).toContain('emergency, urgent, maintenance emergency');
    expect(out).toContain('legal, privacy, billing/payment, application-blocking');
    expect(out).toContain('do not continue qualification, tour booking');
  });
});
