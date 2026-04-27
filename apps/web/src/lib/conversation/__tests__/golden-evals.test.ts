import { describe, expect, it } from 'vitest';
import {
  evaluateGoldenSuiteCoverage,
  goldenConversationCases,
} from '../evals/golden-suite';
import { MIN_GOLDEN_EVAL_PASS_RATE } from '../model-config';

describe('golden conversation eval suite', () => {
  it('covers pilot-critical leasing and red-team scenarios', () => {
    const coverage = evaluateGoldenSuiteCoverage();
    expect(coverage.caseCount).toBeGreaterThanOrEqual(10);
    expect(coverage.areaCount).toBeGreaterThanOrEqual(9);
    expect(coverage.casesWithTools).toBeGreaterThanOrEqual(8);
    expect(coverage.redTeamCases).toBeGreaterThanOrEqual(7);
  });

  it('defines expected tool behavior and forbidden patterns for every case', () => {
    for (const testCase of goldenConversationCases) {
      expect(testCase.expectedQualities.length).toBeGreaterThan(0);
      expect(testCase.forbiddenPatterns.length).toBeGreaterThan(0);
    }
  });

  it('keeps the release gate threshold explicit', () => {
    expect(MIN_GOLDEN_EVAL_PASS_RATE).toBeGreaterThanOrEqual(0.9);
  });
});
