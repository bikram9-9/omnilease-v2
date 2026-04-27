import { describe, expect, it } from 'vitest';
import {
  evaluatePhaseBReleaseGate,
  phaseBBlockingStoryIds,
  phaseBComplaintClusters,
  type PhaseBLiveEvidence,
  type PhaseBStoryEvidence,
} from '../phase-b-release-gate';

const completeStories: PhaseBStoryEvidence[] = phaseBBlockingStoryIds.map((issueId) => ({
  issueId,
  status: 'Done',
  proofCommented: true,
}));

const completeLiveEvidence: PhaseBLiveEvidence[] = Array.from(
  new Set(phaseBComplaintClusters.flatMap((cluster) => cluster.requiredLiveEvidence)),
).map((key) => ({
  key,
  label: key,
  status: 'passed',
}));

describe('Phase B release gate', () => {
  it('passes only when stories, live evidence, readiness, and final proof are complete', () => {
    const gate = evaluatePhaseBReleaseGate({
      stories: completeStories,
      liveEvidence: completeLiveEvidence,
      propertyReadinessPassed: true,
      finalProofCommented: true,
    });

    expect(gate.passed).toBe(true);
    expect(gate.blockers).toHaveLength(0);
    expect(gate.clusters.every((cluster) => cluster.passed)).toBe(true);
  });

  it('blocks incomplete stories, missing live evidence, readiness failures, and missing final proof', () => {
    const gate = evaluatePhaseBReleaseGate({
      stories: completeStories.map((story) => (
        story.issueId === 'OMN-146' ? { ...story, proofCommented: false } : story
      )),
      liveEvidence: completeLiveEvidence.filter((evidence) => evidence.key !== 'calendar-provider-live'),
      propertyReadinessPassed: false,
      finalProofCommented: false,
    });

    expect(gate.passed).toBe(false);
    expect(gate.blockers).toEqual(expect.arrayContaining([
      'Quote, application link, and fee transparency: OMN-146 is not Done with proof.',
      'Calendar-backed tour booking and ownership: live evidence missing or blocked for calendar-provider-live.',
      'Property readiness evaluator is not passing.',
      'Final Phase B release proof comment has not been posted.',
    ]));
  });

  it('keeps every complaint cluster tied to stories, readiness checks, and release proof', () => {
    for (const cluster of phaseBComplaintClusters) {
      expect(cluster.blockerStories.length).toBeGreaterThan(0);
      expect(cluster.readinessKeys.length).toBeGreaterThan(0);
      expect(cluster.releaseProof).toMatch(/\w/);
    }
  });
});
