export type GuestCardIdentityInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  externalId?: string | null;
  channel?: string | null;
};

export type GuestCardIdentity = {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  normalizedName: string | null;
  normalizedEmail: string | null;
  normalizedPhone: string | null;
  externalIds: Record<string, string>;
};

export type DuplicateMatchInput = {
  normalizedName?: string | null;
  normalizedEmail?: string | null;
  normalizedPhone?: string | null;
  externalIds?: Record<string, string> | null;
};

export type DuplicateMatchResult = {
  reasons: string[];
  confidence: number;
};

export function normalizeEmail(email?: string | null): string | null {
  const value = email?.trim().toLowerCase();
  return value && value.includes('@') ? value : null;
}

export function normalizePhone(phone?: string | null): string | null {
  const digits = phone?.replace(/\D/g, '') ?? '';
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 7) return `+${digits}`;
  return null;
}

export function normalizeName(name?: string | null): string | null {
  const value = name
    ?.trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return value || null;
}

export function buildGuestCardIdentity(input: GuestCardIdentityInput): GuestCardIdentity {
  const channel = input.channel?.trim();
  const externalId = input.externalId?.trim();
  return {
    fullName: input.name?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    normalizedName: normalizeName(input.name),
    normalizedEmail: normalizeEmail(input.email),
    normalizedPhone: normalizePhone(input.phone),
    externalIds: channel && externalId ? { [channel]: externalId } : {},
  };
}

export function compareGuestCardIdentity(
  incoming: DuplicateMatchInput,
  candidate: DuplicateMatchInput,
): DuplicateMatchResult {
  const reasons: string[] = [];
  let confidence = 0;

  if (
    incoming.normalizedEmail
    && candidate.normalizedEmail
    && incoming.normalizedEmail === candidate.normalizedEmail
  ) {
    reasons.push('email');
    confidence = Math.max(confidence, 0.98);
  }

  if (
    incoming.normalizedPhone
    && candidate.normalizedPhone
    && incoming.normalizedPhone === candidate.normalizedPhone
  ) {
    reasons.push('phone');
    confidence = Math.max(confidence, 0.96);
  }

  const incomingExternalIds = incoming.externalIds ?? {};
  const candidateExternalIds = candidate.externalIds ?? {};
  for (const [channel, externalId] of Object.entries(incomingExternalIds)) {
    if (externalId && candidateExternalIds[channel] === externalId) {
      reasons.push(`external:${channel}`);
      confidence = Math.max(confidence, 0.92);
    }
  }

  if (
    incoming.normalizedName
    && candidate.normalizedName
    && incoming.normalizedName === candidate.normalizedName
  ) {
    reasons.push('name');
    confidence = Math.max(confidence, 0.58);
  }

  return { reasons, confidence: Number(confidence.toFixed(2)) };
}

