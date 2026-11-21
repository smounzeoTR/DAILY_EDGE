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
  /\b(envie de|veux) disparaitre\b/,
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
];

export function detectDistress(text: string): boolean {
  const t = normalize(text);
  return PATTERNS.some((p) => p.test(t));
}
