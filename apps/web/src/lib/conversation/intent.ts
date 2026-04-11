export const INTENTS = [
  'pricing',
  'pets',
  'parking',
  'amenities',
  'tour',
  'application',
  'availability',
  'complaint',
  'other',
] as const;

export type Intent = (typeof INTENTS)[number];

// Keyword tables ordered by specificity. First match wins.
// Patterns use word-ish boundaries (\b) so "price" matches "price?" but not "sprites".
const PATTERNS: Array<[Intent, RegExp]> = [
  ['complaint',    /\b(unacceptable|complain|complaint|manager|supervisor|awful|terrible|horrible)\b/i],
  ['tour',         /\b(tour|visit|show\s+me|come\s+see|showing|walk\s*through|open\s+house|schedul(e|ing))\b/i],
  ['application',  /\b(appl(y|ication|ying)|qualif(y|ication)|approve|approval|credit\s*check)\b/i],
  ['pricing',      /\b(price|pricing|rent|cost|monthly|deposit|fee|specials?|promo|discount)\b/i],
  ['pets',         /\b(pet|pets|dog|dogs|cat|cats|animal|breed|weight\s*limit)\b/i],
  ['parking',      /\b(park|parking|garage|carport|spot|ev\s*charg|bike\s*rack)\b/i],
  ['amenities',    /\b(gym|pool|hot\s*tub|lounge|clubhouse|laundry|dishwasher|wifi|amenity|amenities|playground)\b/i],
  ['availability', /\b(available|availability|open\s+units?|vacan(t|cy)|move[-\s]?in|when\s+can\s+i)\b/i],
];

export function classifyIntent(text: string): Intent {
  for (const [intent, re] of PATTERNS) {
    if (re.test(text)) return intent;
  }
  return 'other';
}
