export type PhaseBComplaintClusterKey =
  | 'human-emergency'
  | 'disclosure-privacy'
  | 'calendar-tour'
  | 'consent-outreach'
  | 'answer-quality'
  | 'quote-fees'
  | 'dashboard-visibility'
  | 'launch-readiness';

export type PhaseBReleaseEvidenceStatus = 'passed' | 'missing' | 'blocked' | 'not_required';

export type PhaseBStoryEvidence = {
  issueId: string;
  status: 'Done' | 'In Progress' | 'Todo' | 'Canceled';
  proofCommented: boolean;
};

export type PhaseBLiveEvidence = {
  key: string;
  label: string;
  status: PhaseBReleaseEvidenceStatus;
  notes?: string;
};

export type PhaseBComplaintCluster = {
  key: PhaseBComplaintClusterKey;
  label: string;
  complaintRisk: string;
  blockerStories: string[];
  readinessKeys: string[];
  requiredLiveEvidence: string[];
  releaseProof: string;
};

export const phaseBComplaintClusters: PhaseBComplaintCluster[] = [
  {
    key: 'human-emergency',
    label: 'Human handoff and emergency routing',
    complaintRisk: 'Users trapped in AI loops when asking for a person or reporting urgent issues.',
    blockerStories: ['OMN-154', 'OMN-157', 'OMN-158'],
    readinessKeys: ['escalation-contact', 'test-conversations'],
    requiredLiveEvidence: ['human-takeover-browser'],
    releaseProof: 'Escalation intent stops automation, creates visible operator work, and is covered by validation prompts.',
  },
  {
    key: 'disclosure-privacy',
    label: 'AI disclosure, privacy, and contact fallback',
    complaintRisk: 'Prospects do not know they are speaking with AI or how their data/contact path works.',
    blockerStories: ['OMN-155', 'OMN-158'],
    readinessKeys: ['ai-disclosure', 'privacy-contact-fallback', 'consent-disclosure'],
    requiredLiveEvidence: ['widget-disclosure-browser'],
    releaseProof: 'Widget/session launch copy discloses AI identity and shows privacy plus human contact fallback.',
  },
  {
    key: 'calendar-tour',
    label: 'Calendar-backed tour booking and ownership',
    complaintRisk: 'Double-booked tours, unsupported provider state, or appointments with no accountable owner.',
    blockerStories: ['OMN-119', 'OMN-120', 'OMN-121', 'OMN-122', 'OMN-145', 'OMN-158'],
    readinessKeys: ['tour-settings', 'calendar-provider', 'tour-owners'],
    requiredLiveEvidence: ['calendar-provider-live', 'tour-booking-browser'],
    releaseProof: 'Availability, final conflict checks, notifications, owner routing, and dashboard reporting are verified.',
  },
  {
    key: 'consent-outreach',
    label: 'Consent, opt-out, quiet hours, and frequency caps',
    complaintRisk: 'Unwanted repeated outreach after opt-out, quiet hours, or human takeover.',
    blockerStories: ['OMN-121', 'OMN-156', 'OMN-158'],
    readinessKeys: ['consent-disclosure'],
    requiredLiveEvidence: ['notification-scheduling-integration'],
    releaseProof: 'Proactive tour messages respect consent, suppression, quiet hours, and rate limits.',
  },
  {
    key: 'answer-quality',
    label: 'Repetition, uncertainty, and unsupported workflow fallback',
    complaintRisk: 'The assistant repeats questions, guesses, or improvises on sensitive unsupported workflows.',
    blockerStories: ['OMN-154', 'OMN-157', 'OMN-158'],
    readinessKeys: ['knowledge', 'assistant-settings', 'test-conversations'],
    requiredLiveEvidence: ['golden-evals'],
    releaseProof: 'Low-confidence, emergency, legal/privacy/payment/application-blocking, and unsupported cases route safely.',
  },
  {
    key: 'quote-fees',
    label: 'Quote, application link, and fee transparency',
    complaintRisk: 'Pricing, fee, application, and floorplan answers are incomplete or unverifiable.',
    blockerStories: ['OMN-146', 'OMN-157', 'OMN-158'],
    readinessKeys: ['knowledge', 'test-conversations'],
    requiredLiveEvidence: ['quote-tool-integration'],
    releaseProof: 'Structured quote/application/fee data is used or the assistant escalates when data is incomplete.',
  },
  {
    key: 'dashboard-visibility',
    label: 'Dashboard visibility for AI-created actions and failures',
    complaintRisk: 'Operators cannot see tours, escalations, follow-ups, provider failures, or pending human work.',
    blockerStories: ['OMN-121', 'OMN-122', 'OMN-145', 'OMN-158'],
    readinessKeys: ['calendar-provider', 'tour-owners'],
    requiredLiveEvidence: ['dashboard-review-browser'],
    releaseProof: 'Tours, statuses, owner routing, notification work, provider health, and readiness blockers are visible.',
  },
  {
    key: 'launch-readiness',
    label: 'Launch readiness and allowlist testing before production',
    complaintRisk: 'A property is rolled out before owners, integrations, and test conversations are ready.',
    blockerStories: ['OMN-141', 'OMN-153', 'OMN-158'],
    readinessKeys: ['launch-mode', 'test-conversations'],
    requiredLiveEvidence: ['go-no-go-record'],
    releaseProof: 'Release starts in monitor/allowlist mode with validation results and a final go/no-go record.',
  },
];

export const phaseBBlockingStoryIds = Array.from(
  new Set(phaseBComplaintClusters.flatMap((cluster) => cluster.blockerStories)),
).sort();

export function evaluatePhaseBReleaseGate(input: {
  stories: PhaseBStoryEvidence[];
  liveEvidence: PhaseBLiveEvidence[];
  propertyReadinessPassed: boolean;
  finalProofCommented: boolean;
}) {
  const storyById = new Map(input.stories.map((story) => [story.issueId, story]));
  const liveEvidenceByKey = new Map(input.liveEvidence.map((evidence) => [evidence.key, evidence]));

  const clusterResults = phaseBComplaintClusters.map((cluster) => {
    const storyBlockers = cluster.blockerStories
      .map((issueId) => storyById.get(issueId) ?? { issueId, status: 'Todo' as const, proofCommented: false })
      .filter((story) => story.status !== 'Done' || !story.proofCommented)
      .map((story) => story.issueId);
    const liveBlockers = cluster.requiredLiveEvidence
      .map((key) => liveEvidenceByKey.get(key) ?? { key, label: key, status: 'missing' as const })
      .filter((evidence) => evidence.status === 'missing' || evidence.status === 'blocked')
      .map((evidence) => evidence.key);

    return {
      ...cluster,
      storyBlockers,
      liveBlockers,
      passed: storyBlockers.length === 0 && liveBlockers.length === 0,
    };
  });

  const blockers = [
    ...clusterResults.flatMap((cluster) => [
      ...cluster.storyBlockers.map((issueId) => `${cluster.label}: ${issueId} is not Done with proof.`),
      ...cluster.liveBlockers.map((key) => `${cluster.label}: live evidence missing or blocked for ${key}.`),
    ]),
    ...(input.propertyReadinessPassed ? [] : ['Property readiness evaluator is not passing.']),
    ...(input.finalProofCommented ? [] : ['Final Phase B release proof comment has not been posted.']),
  ];

  return {
    clusters: clusterResults,
    blockers,
    passed: blockers.length === 0,
  };
}
