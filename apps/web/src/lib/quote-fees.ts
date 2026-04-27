import type { FeeLineItem } from '@omnilease/db';

export type FeeCadence = 'monthly' | 'one_time';

export type QuoteFeeLine = FeeLineItem & {
  cadence: FeeCadence;
};

export type QuoteUnitInput = {
  name: string;
  priceMin: string | null;
  priceMax: string | null;
  deposit: string | null;
  recurringFees?: FeeLineItem[] | null;
  oneTimeFees?: FeeLineItem[] | null;
  specials?: string | null;
  quoteDisclaimer?: string | null;
};

export type QuotePropertyInput = {
  applicationUrl: string | null;
  applicationFee: string | null;
  recurringFees?: FeeLineItem[] | null;
  oneTimeFees?: FeeLineItem[] | null;
  petFees?: FeeLineItem[] | null;
  parkingFees?: FeeLineItem[] | null;
  leasingSpecials?: string | null;
  quoteDisclaimer?: string | null;
};

export function normalizeFeeItems(value: unknown): FeeLineItem[] {
  if (!Array.isArray(value)) return [];
  const items: FeeLineItem[] = [];
  for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const label = typeof record.label === 'string' ? record.label.trim() : '';
      const amount = Number(record.amount);
      if (!label || !Number.isFinite(amount) || amount < 0) continue;
      const notes = typeof record.notes === 'string' && record.notes.trim()
        ? record.notes.trim()
        : undefined;
      items.push({
        label,
        amount,
        required: record.required !== false,
        ...(notes ? { notes } : {}),
      });
  }
  return items;
}

export function parseFeeLines(text: string): FeeLineItem[] {
  const items: FeeLineItem[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const [labelPart, amountPart, requiredPart, ...notesParts] = line.split('|').map((part) => part.trim());
    const label = labelPart ?? '';
    const amount = Number((amountPart ?? '').replace(/[$,]/g, ''));
    if (!label || !Number.isFinite(amount) || amount < 0) continue;
    const required = requiredPart ? !/^(optional|no|false)$/i.test(requiredPart) : true;
    const notes = notesParts.join(' | ').trim();
    items.push({
      label,
      amount,
      required,
      ...(notes ? { notes } : {}),
    });
  }
  return items;
}

export function formatFeeLines(items: FeeLineItem[] | null | undefined): string {
  return normalizeFeeItems(items).map((item) => [
    item.label,
    item.amount,
    item.required === false ? 'optional' : 'required',
    item.notes ?? '',
  ].join(' | ').replace(/\s+\|\s+$/, '')).join('\n');
}

export function buildQuote(input: {
  property: QuotePropertyInput;
  unit: QuoteUnitInput | null;
}) {
  const unit = input.unit;
  const baseRentMin = toMoneyNumber(unit?.priceMin);
  const baseRentMax = toMoneyNumber(unit?.priceMax) ?? baseRentMin;
  const deposit = toMoneyNumber(unit?.deposit);
  const applicationFee = toMoneyNumber(input.property.applicationFee);

  const monthlyFees = [
    ...toQuoteLines(input.property.recurringFees, 'monthly'),
    ...toQuoteLines(input.property.petFees, 'monthly'),
    ...toQuoteLines(input.property.parkingFees, 'monthly'),
    ...toQuoteLines(unit?.recurringFees, 'monthly'),
  ];
  const oneTimeFees = [
    ...toQuoteLines(input.property.oneTimeFees, 'one_time'),
    ...toQuoteLines(unit?.oneTimeFees, 'one_time'),
  ];
  if (typeof applicationFee === 'number') {
    oneTimeFees.unshift({
      label: 'Application fee',
      amount: applicationFee,
      required: true,
      cadence: 'one_time',
    });
  }
  if (typeof deposit === 'number') {
    oneTimeFees.unshift({
      label: 'Deposit',
      amount: deposit,
      required: true,
      cadence: 'one_time',
    });
  }

  const requiredMonthlyFees = monthlyFees.filter((fee) => fee.required !== false);
  const requiredOneTimeFees = oneTimeFees.filter((fee) => fee.required !== false);
  const monthlyFeeTotal = sum(requiredMonthlyFees);
  const moveInFeeTotal = sum(requiredOneTimeFees);

  return {
    unitName: unit?.name ?? null,
    baseRentMin,
    baseRentMax,
    monthlyFees,
    oneTimeFees,
    estimatedMonthlyMin: typeof baseRentMin === 'number' ? baseRentMin + monthlyFeeTotal : null,
    estimatedMonthlyMax: typeof baseRentMax === 'number' ? baseRentMax + monthlyFeeTotal : null,
    estimatedMoveInFees: moveInFeeTotal,
    applicationUrl: input.property.applicationUrl,
    specials: [unit?.specials, input.property.leasingSpecials].filter(Boolean) as string[],
    disclaimers: [unit?.quoteDisclaimer, input.property.quoteDisclaimer].filter(Boolean) as string[],
    missing: {
      rent: typeof baseRentMin !== 'number',
      applicationUrl: !input.property.applicationUrl,
      disclaimer: !unit?.quoteDisclaimer && !input.property.quoteDisclaimer,
    },
  };
}

export function formatMoney(value: number | null): string {
  if (value === null) return 'unknown';
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function toQuoteLines(items: FeeLineItem[] | null | undefined, cadence: FeeCadence): QuoteFeeLine[] {
  return normalizeFeeItems(items).map((item) => ({ ...item, cadence }));
}

function toMoneyNumber(value: string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sum(lines: Array<{ amount: number }>): number {
  return lines.reduce((total, line) => total + line.amount, 0);
}
