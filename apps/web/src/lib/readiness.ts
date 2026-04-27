import type {
  CalendarAuthStatus,
  Property,
  PropertyAssistantSettings,
  PropertyKnowledgeSection,
  PropertyLaunchMode,
  PropertyTourSettings,
  ReadinessTestResult,
  TourOwner,
} from '@omnilease/db';

export type ReadinessSeverity = 'blocker' | 'warning';
export type ReadinessStatus = 'passed' | 'failed' | 'warning';

export type ReadinessItem = {
  key: string;
  label: string;
  status: ReadinessStatus;
  severity: ReadinessSeverity;
  detail: string;
  complaintPlanMapping: string;
};

export type PropertyReadinessInput = {
  property: Pick<Property,
    | 'escalationEmail'
    | 'aiDisclosure'
    | 'privacyNoticeUrl'
    | 'privacyDisclosureText'
    | 'contactFallbackLabel'
    | 'contactFallbackUrl'
    | 'contactFallbackText'
    | 'websiteWidgetId'
    | 'launchMode'
    | 'readinessTestResults'
  >;
  knowledgeSections: Array<Pick<PropertyKnowledgeSection, 'section' | 'status' | 'validationWarnings'>>;
  assistantSettings: Pick<PropertyAssistantSettings, 'primaryGoal' | 'ctaPreference' | 'escalationTriggers'> | null;
  tourSettings: Pick<PropertyTourSettings,
    | 'enabledTourTypes'
    | 'tourHours'
    | 'calendarProvider'
    | 'calendarAuthStatus'
    | 'calendarLastCheckedAt'
    | 'calendarLastError'
  > | null;
  activeTourOwners: Array<Pick<TourOwner, 'id'>>;
};

export const launchModeLabels: Record<PropertyLaunchMode, string> = {
  draft: 'Draft',
  monitor: 'Monitor',
  allowlist: 'Allowlist',
  production: 'Production',
};

const requiredTestAreas = ['pricing', 'availability', 'fees', 'tours', 'human handoff'];

export function evaluatePropertyReadiness(input: PropertyReadinessInput) {
  const items: ReadinessItem[] = [
    check(
      'escalation-contact',
      'Escalation contact',
      Boolean(input.property.escalationEmail),
      'blocker',
      input.property.escalationEmail
        ? `Escalation inbox configured: ${input.property.escalationEmail}.`
        : 'Missing monitored escalation email.',
      'Prevents hard-to-reach human and emergency-loop complaints.',
    ),
    check(
      'ai-disclosure',
      'AI disclosure',
      Boolean(input.property.aiDisclosure),
      'blocker',
      input.property.aiDisclosure
        ? 'First-message AI disclosure is configured.'
        : 'Missing explicit AI disclosure copy.',
      'Addresses users not realizing they are speaking with AI.',
    ),
    check(
      'privacy-contact-fallback',
      'Privacy and contact fallback',
      hasPrivacyDisclosure(input.property) && hasContactFallback(input.property),
      'blocker',
      hasPrivacyDisclosure(input.property) && hasContactFallback(input.property)
        ? 'Privacy notice and human/property contact fallback are configured.'
        : 'Missing privacy notice/disclosure or human/property contact fallback.',
      'Addresses privacy concerns and unclear human contact paths.',
    ),
    check(
      'knowledge',
      'Knowledge validation',
      hasKnowledge(input.knowledgeSections),
      'blocker',
      knowledgeDetail(input.knowledgeSections),
      'Prevents unverifiable pricing, fee, floorplan, and application answers.',
    ),
    check(
      'assistant-settings',
      'Assistant settings',
      Boolean(input.assistantSettings),
      'warning',
      input.assistantSettings
        ? `Goal: ${input.assistantSettings.primaryGoal}; CTA: ${input.assistantSettings.ctaPreference}.`
        : 'Using defaults; custom launch settings not reviewed.',
      'Keeps operator-approved behavior ahead of launch.',
    ),
    check(
      'tour-settings',
      'Tour settings',
      Boolean(input.tourSettings && input.tourSettings.enabledTourTypes.length > 0),
      'blocker',
      input.tourSettings
        ? `Tour types: ${input.tourSettings.enabledTourTypes.join(', ')}.`
        : 'Tour settings are missing.',
      'Prevents integrations appearing ready when scheduling is not configured.',
    ),
    calendarProviderItem(input.tourSettings),
    check(
      'tour-owners',
      'Tour owner routing',
      input.activeTourOwners.length > 0,
      'blocker',
      input.activeTourOwners.length > 0
        ? `${input.activeTourOwners.length} active tour owner(s) configured.`
        : 'No active tour owners configured.',
      'Ensures AI-created tours have an accountable operator/agent.',
    ),
    check(
      'consent-disclosure',
      'Consent and disclosure baseline',
      hasPrivacyDisclosure(input.property) && Boolean(input.property.aiDisclosure),
      'blocker',
      hasPrivacyDisclosure(input.property) && Boolean(input.property.aiDisclosure)
        ? 'Disclosure and privacy baseline are configured for proactive messaging safety.'
        : 'Disclosure/privacy baseline is incomplete.',
      'Prevents unwanted or opaque automation complaints.',
    ),
    check(
      'test-conversations',
      'Launch validation script',
      hasRequiredTestResults(input.property.readinessTestResults),
      'blocker',
      testResultsDetail(input.property.readinessTestResults),
      'Records proof that pricing, fees, tours, and human handoff were tested.',
    ),
    check(
      'launch-mode',
      'Monitor or allowlist mode',
      input.property.launchMode === 'monitor' || input.property.launchMode === 'allowlist',
      'warning',
      `Current mode: ${launchModeLabels[input.property.launchMode]}.`,
      'Prevents surprise production rollout before go/no-go approval.',
    ),
  ];

  const blockers = items.filter((item) => item.severity === 'blocker' && item.status === 'failed');
  const warnings = items.filter((item) => item.status === 'warning');

  return {
    items,
    blockers,
    warnings,
    passed: blockers.length === 0,
    mode: input.property.launchMode,
    canExposeProduction: blockers.length === 0 && input.property.launchMode === 'production',
  };
}

export function parseReadinessTestResults(text: string, now = new Date()): ReadinessTestResult[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [areaPart, statusPart, conversationIdPart, ...notesParts] = line.split('|').map((part) => part.trim());
      const area = areaPart || 'unknown';
      const status = /^pass(ed)?$/i.test(statusPart ?? '') ? 'passed' : 'failed';
      const conversationId = conversationIdPart || undefined;
      const notes = notesParts.join(' | ').trim() || undefined;
      return {
        area,
        status,
        ...(conversationId ? { conversationId } : {}),
        ...(notes ? { notes } : {}),
        checkedAt: now.toISOString(),
      };
    });
}

export function formatReadinessTestResults(results: ReadinessTestResult[]): string {
  return results.map((result) => [
    result.area,
    result.status,
    result.conversationId ?? '',
    result.notes ?? '',
  ].join(' | ').replace(/\s+\|\s+$/, '')).join('\n');
}

function calendarProviderItem(
  settings: PropertyReadinessInput['tourSettings'],
): ReadinessItem {
  if (!settings) {
    return check(
      'calendar-provider',
      'Calendar/provider health',
      false,
      'blocker',
      'Tour provider settings are missing.',
      'Prevents broken calendar integrations and double-booking trust failures.',
    );
  }

  const status = settings.calendarAuthStatus as CalendarAuthStatus;
  const providerFailure = status === 'error';
  const detail = [
    `Provider: ${settings.calendarProvider}.`,
    `Status: ${status}.`,
    settings.calendarLastCheckedAt ? `Last checked: ${settings.calendarLastCheckedAt.toISOString()}.` : 'Last checked: never.',
    settings.calendarLastError ? `Last error: ${settings.calendarLastError}.` : null,
  ].filter(Boolean).join(' ');

  return check(
    'calendar-provider',
    'Calendar/provider health',
    !providerFailure,
    'blocker',
    detail,
    'Prevents broken calendar integrations and double-booking trust failures.',
  );
}

function check(
  key: string,
  label: string,
  passed: boolean,
  severity: ReadinessSeverity,
  detail: string,
  complaintPlanMapping: string,
): ReadinessItem {
  return {
    key,
    label,
    status: passed ? 'passed' : severity === 'warning' ? 'warning' : 'failed',
    severity,
    detail,
    complaintPlanMapping,
  };
}

function hasPrivacyDisclosure(property: PropertyReadinessInput['property']) {
  return Boolean(property.privacyNoticeUrl || property.privacyDisclosureText);
}

function hasContactFallback(property: PropertyReadinessInput['property']) {
  return Boolean(property.contactFallbackLabel || property.contactFallbackUrl || property.contactFallbackText);
}

function hasKnowledge(sections: PropertyReadinessInput['knowledgeSections']) {
  return sections.some((section) => section.status === 'published')
    && sections.every((section) => section.validationWarnings.length === 0);
}

function knowledgeDetail(sections: PropertyReadinessInput['knowledgeSections']) {
  if (sections.length === 0) return 'No published knowledge sections found.';
  const warnings = sections.reduce((count, section) => count + section.validationWarnings.length, 0);
  return `${sections.length} knowledge section(s), ${warnings} validation warning(s).`;
}

function hasRequiredTestResults(results: ReadinessTestResult[]) {
  const passedAreas = new Set(
    results
      .filter((result) => result.status === 'passed')
      .map((result) => result.area.toLowerCase()),
  );
  return requiredTestAreas.every((area) => passedAreas.has(area));
}

function testResultsDetail(results: ReadinessTestResult[]) {
  if (results.length === 0) return 'No launch validation test results recorded.';
  const passed = results.filter((result) => result.status === 'passed').length;
  return `${passed}/${results.length} recorded validation prompt(s) passed.`;
}
