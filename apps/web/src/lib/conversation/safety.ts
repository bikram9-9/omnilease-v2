export type SafetyResult = {
  text: string;
  flagged: boolean;       // true if any filter rewrote or stripped content
  autoEscalate: boolean;  // true if confidence too low
  confidence: number;     // 0..1
};

// Phrases that could be read as Fair Housing violations or steering.
// Case-insensitive, whole-phrase match. Replacement is a generic fallback.
const FAIR_HOUSING_PHRASES: RegExp[] = [
  /\bfamily[-\s]friendly\b/i,
  /\bquiet\s+community\b/i,
  /\bpeaceful\s+neighborhood\b/i,
  /\bgood\s+schools?\b/i,
  /\bsafe\s+area\b/i,
  /\bnice\s+families\b/i,
];

// PII patterns.
const SSN_RE          = /\b\d{3}-\d{2}-\d{4}\b/g;
const CC_RE           = /\b(?:\d[ -]?){13,19}\b/g;

// Hedging markers — more hits == lower confidence.
const HEDGE_MARKERS: RegExp[] = [
  /\bi'?m not sure\b/i,
  /\bi think\b/i,
  /\bmaybe\b/i,
  /\bmight be\b/i,
  /\bi don'?t (really )?know\b/i,
  /\bnot certain\b/i,
  /\bprobably\b/i,
];

const NEUTRAL_FALLBACK = "We have details on that — want me to send specifics over, or connect you with the leasing team?";

export function applySafetyFilter(input: string): SafetyResult {
  let text = input;
  let flagged = false;

  // 1) Fair housing phrases — replace the whole output with the neutral fallback
  //    so we never surface loaded language.
  for (const re of FAIR_HOUSING_PHRASES) {
    if (re.test(text)) {
      text = NEUTRAL_FALLBACK;
      flagged = true;
      break;
    }
  }

  // 2) PII scrub — redact in place.
  if (SSN_RE.test(text)) {
    text = text.replace(SSN_RE, '[redacted]');
    flagged = true;
  }
  SSN_RE.lastIndex = 0;

  if (CC_RE.test(text)) {
    text = text.replace(CC_RE, '[redacted]');
    flagged = true;
  }
  CC_RE.lastIndex = 0;

  // 3) Confidence via hedge count.
  let hedges = 0;
  for (const re of HEDGE_MARKERS) {
    if (re.test(text)) hedges += 1;
  }
  // 0 hedges = 0.95 confidence; each hedge drops 0.15.
  const confidence = Math.max(0, Math.min(1, 0.95 - hedges * 0.15));
  const autoEscalate = confidence < 0.7;

  return { text, flagged, autoEscalate, confidence };
}
