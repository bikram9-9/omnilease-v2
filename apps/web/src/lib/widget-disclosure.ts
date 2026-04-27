type WidgetDisclosureProperty = {
  name: string;
  welcomeMessage?: string | null;
  aiDisclosure?: string | null;
  privacyNoticeUrl?: string | null;
  termsUrl?: string | null;
  privacyDisclosureText?: string | null;
  contactFallbackLabel?: string | null;
  contactFallbackUrl?: string | null;
  contactFallbackText?: string | null;
};

export type WidgetDisclosureConfig = {
  aiDisclosure: string;
  initialAssistantMessage: string;
  privacyNoticeUrl: string | null;
  termsUrl: string | null;
  privacyDisclosureText: string | null;
  contactFallbackLabel: string | null;
  contactFallbackUrl: string | null;
  contactFallbackText: string | null;
};

export type ReadinessItem = {
  key: 'ai_disclosure' | 'privacy_terms' | 'contact_fallback';
  label: string;
  passed: boolean;
  detail: string;
};

export type WidgetReleaseReadiness = {
  passed: boolean;
  items: ReadinessItem[];
};

export function defaultAiDisclosure(propertyName: string): string {
  return `I'm an AI assistant for ${propertyName}. I can help with leasing questions and connect you with the property team when needed.`;
}

export function buildWidgetDisclosureConfig(property: WidgetDisclosureProperty): WidgetDisclosureConfig {
  const aiDisclosure = trimmedOrNull(property.aiDisclosure) ?? defaultAiDisclosure(property.name);
  const welcomeMessage = trimmedOrNull(property.welcomeMessage);

  return {
    aiDisclosure,
    initialAssistantMessage: welcomeMessage ? `${aiDisclosure}\n\n${welcomeMessage}` : aiDisclosure,
    privacyNoticeUrl: trimmedOrNull(property.privacyNoticeUrl),
    termsUrl: trimmedOrNull(property.termsUrl),
    privacyDisclosureText: trimmedOrNull(property.privacyDisclosureText),
    contactFallbackLabel: trimmedOrNull(property.contactFallbackLabel),
    contactFallbackUrl: trimmedOrNull(property.contactFallbackUrl),
    contactFallbackText: trimmedOrNull(property.contactFallbackText),
  };
}

export function getWidgetReleaseReadiness(property: WidgetDisclosureProperty): WidgetReleaseReadiness {
  const hasAiDisclosure = Boolean(trimmedOrNull(property.aiDisclosure));
  const hasPrivacyTerms = Boolean(
    trimmedOrNull(property.privacyNoticeUrl)
      ?? trimmedOrNull(property.termsUrl)
      ?? trimmedOrNull(property.privacyDisclosureText),
  );
  const hasContactFallback = Boolean(
    trimmedOrNull(property.contactFallbackUrl)
      ?? trimmedOrNull(property.contactFallbackText),
  );

  const items: ReadinessItem[] = [
    {
      key: 'ai_disclosure',
      label: 'AI disclosure',
      passed: hasAiDisclosure,
      detail: hasAiDisclosure
        ? 'Configured disclosure copy will be shown before chat.'
        : 'Add property-approved AI disclosure copy before go-live.',
    },
    {
      key: 'privacy_terms',
      label: 'Privacy or terms',
      passed: hasPrivacyTerms,
      detail: hasPrivacyTerms
        ? 'Privacy/terms link or disclosure copy is configured.'
        : 'Add a privacy link, terms link, or property-provided disclosure copy.',
    },
    {
      key: 'contact_fallback',
      label: 'Human contact fallback',
      passed: hasContactFallback,
      detail: hasContactFallback
        ? 'Human/property contact fallback is configured.'
        : 'Add a phone, email, office-hours note, contact page, or other human fallback.',
    },
  ];

  return {
    passed: items.every((item) => item.passed),
    items,
  };
}

function trimmedOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
