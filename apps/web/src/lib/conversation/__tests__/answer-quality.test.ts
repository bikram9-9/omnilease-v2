import { describe, expect, it } from 'vitest';
import {
  buildAnswerSourceEvidence,
  classifyUnsupportedWorkflow,
  detectRepeatedCapturedDetailQuestion,
  renderAnswerSourceRules,
  renderCapturedProspectMemory,
} from '../answer-quality';

describe('answer-quality guardrails', () => {
  it('renders captured prospect details and warns the model not to re-ask them', () => {
    const prompt = renderCapturedProspectMemory({
      prospectName: 'Jordan Lee',
      prospectEmail: 'jordan@example.com',
      prospectPhone: null,
      moveInDate: '2026-06-01',
      unitPreference: '2 bed',
    });

    expect(prompt).toContain('Name: Jordan Lee');
    expect(prompt).toContain('Email: jordan@example.com');
    expect(prompt).toContain('Move-in date: 2026-06-01');
    expect(prompt).toContain('Do not ask again');
  });

  it('detects assistant attempts to re-ask already captured details', () => {
    const guardrail = detectRepeatedCapturedDetailQuestion(
      'Great, what is your email address and what move-in date are you targeting?',
      {
        prospectName: null,
        prospectEmail: 'jordan@example.com',
        prospectPhone: null,
        moveInDate: '2026-06-01',
        unitPreference: null,
      },
    );

    expect(guardrail).toMatchObject({
      category: 'repeated_captured_detail',
      reason: expect.stringContaining('email'),
      priority: 'normal',
    });
  });

  it('classifies missing application data as unsupported', () => {
    const guardrail = classifyUnsupportedWorkflow(
      'Can you send me the application link and screening requirements?',
      {
        activeUnitCount: 1,
        hasPricingData: true,
        hasAvailabilityData: true,
        hasFeePolicyContext: false,
        hasApplicationContext: false,
        hasStructuredQuoteData: false,
        hasFloorplanContext: true,
        hasTourTools: true,
      },
    );

    expect(guardrail).toMatchObject({
      category: 'unsupported_application',
      reason: 'Application request lacks structured application source data',
    });
  });

  it('allows application questions when published application context exists', () => {
    const guardrail = classifyUnsupportedWorkflow(
      'What income requirement do you use for applications?',
      {
        activeUnitCount: 1,
        hasPricingData: true,
        hasAvailabilityData: true,
        hasFeePolicyContext: false,
        hasApplicationContext: true,
        hasStructuredQuoteData: false,
        hasFloorplanContext: true,
        hasTourTools: true,
      },
    );

    expect(guardrail).toBeNull();
  });

  it('routes ambiguous floorplan recommendations to human review', () => {
    const guardrail = classifyUnsupportedWorkflow(
      'Which floor plan is best for me?',
      {
        activeUnitCount: 2,
        hasPricingData: true,
        hasAvailabilityData: true,
        hasFeePolicyContext: true,
        hasApplicationContext: true,
        hasStructuredQuoteData: false,
        hasFloorplanContext: true,
        hasTourTools: true,
      },
    );

    expect(guardrail).toMatchObject({
      category: 'floorplan_ambiguity',
      reason: 'Floorplan request is ambiguous and needs human review',
    });
  });

  it('builds source evidence from context without treating missing fee/application sources as known', () => {
    const evidence = buildAnswerSourceEvidence({
      activeUnitCount: 1,
      contextSections: [
        {
          slug: 'overview',
          title: 'Overview',
          filename: 'overview.md',
          body: 'One and two bedroom apartments are available near downtown.',
        },
      ],
    });

    expect(evidence).toMatchObject({
      hasPricingData: true,
      hasAvailabilityData: true,
      hasFeePolicyContext: false,
      hasApplicationContext: false,
      hasFloorplanContext: true,
    });

    const rules = renderAnswerSourceRules(evidence);
    expect(rules).toContain('structured unit inventory is available');
    expect(rules).toContain('no structured application link');
  });
});
