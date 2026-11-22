// Safety net independent of the model: simple detection of distress words (FR and EN) on every
// user message. When it fires, the help card (3114) is shown whatever the model answers.
// Deliberately broad: a false positive only shows the help card.

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ');

const PATTERNS: RegExp[] = [
  // French
  /\bsuicid/,
  /\b(me|m) (tuer|suicider)\b/,
  /\ben finir\b(?! avec)/,
  /\bmettre fin a (mes jours|ma vie)\b/,
  /\b(plus|pas) envie de vivre\b/,
  /\benvie de mourir\b/,
  /\bje (veux|voudrais|vais) mourir\b/,
  /\b(me faire|me fais) du mal\b/,
  /\bautomutil/,
  /\bscarifi/,
  /\b(envie de|veux|voudrais|aimerais|besoin de|j ai envie de) disparaitre\b/,
  /\bdisparaitre pour (toujours|de bon)\b/,
  /\bpersonne ne (le |la |me )?(remarquerait|verrait|s apercevrait|regretterait)\b/,
  /\b(tout le monde|ma famille|ils|mes proches|les autres) (serai(en)?t|seraient) mieux sans moi\b/,
  /\bmieux sans moi\b/,
  /\bne plus (etre la|exister)\b/,
  /\bje ne sers (a|plus a) rien\b/,
  /\bje suis un (poids|fardeau)\b/,
  /\ba quoi bon vivre\b/,
  /\bplus de raison de vivre\b/,
  // English
  /\bkill (myself|me)\b/,
  /\bend (my|it all|my life)\b/,
  /\bwant to die\b/,
  /\bself[- ]?harm/,
  /\bhurt(ing)? myself\b/,
  /\bno reason to live\b/,
  /\bbetter off dead\b/,
  /\bdon t want to (live|be alive)\b/,
  /\b(want to|wanna|feel like|would like to) disappear(ing)?\b/,
  /\bdisappear forever\b/,
  /\b(nobody|no one|no-one) would (even )?(notice|care|miss me)\b/,
  /\bbetter off without me\b/,
  /\bnot (be )?(here|around) anymore\b/,
  /\bi( a| )?m a burden\b/,
  /\bdon t want to be (here|around|alive)( anymore)?\b/,
  /\bi feel (worthless|useless)\b/,
];

export function detectDistress(text: string): boolean {
  const t = normalize(text);
  return PATTERNS.some((p) => p.test(t));
}
