import { describe, expect, it } from 'vitest';
import { buildQuote, formatFeeLines, parseFeeLines } from '../quote-fees';

describe('quote fees', () => {
  it('parses and formats operator fee lines', () => {
    const fees = parseFeeLines('Amenity fee | $45 | required | billed monthly\nGarage | 125 | optional');

    expect(fees).toEqual([
      { label: 'Amenity fee', amount: 45, required: true, notes: 'billed monthly' },
      { label: 'Garage', amount: 125, required: false },
    ]);
    expect(formatFeeLines(fees)).toContain('Amenity fee | 45 | required | billed monthly');
  });

  it('calculates required monthly and move-in estimates with structured fees', () => {
    const quote = buildQuote({
      property: {
        applicationUrl: 'https://apply.example.com',
        applicationFee: '75',
        recurringFees: [{ label: 'Utility package', amount: 95, required: true }],
        oneTimeFees: [{ label: 'Admin fee', amount: 200, required: true }],
        petFees: [{ label: 'Pet rent', amount: 35, required: false }],
        parkingFees: [{ label: 'Reserved parking', amount: 50, required: false }],
        leasingSpecials: 'One month free on select homes.',
        quoteDisclaimer: 'Amounts are estimates and subject to approval.',
      },
      unit: {
        name: '1BR/1BA',
        priceMin: '1500',
        priceMax: '1700',
        deposit: '500',
      },
    });

    expect(quote).toMatchObject({
      estimatedMonthlyMin: 1595,
      estimatedMonthlyMax: 1795,
      estimatedMoveInFees: 775,
      applicationUrl: 'https://apply.example.com',
      missing: {
        rent: false,
        applicationUrl: false,
        disclaimer: false,
      },
    });
  });
});
