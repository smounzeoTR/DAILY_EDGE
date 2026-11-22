// Style checks of the coach's answers (journal and eval).
// - A card announced while no action was created in the turn is logged
//   (llm_calls.detail = card_claimed_without_action). Only an announcement counts: a general or
//   conditional explanation of how cards work ("quand je te propose une action, une carte
//   apparaît") is not one.
// - "vous" addressed to the user (the coach always says "tu"); "votre"/"vos" and a "vous" for
//   several people ("toi et ta sœur, vous...", "vous deux") are not counted.

const CARD_CLAIM = [
  /\b(la|une|cette|ta) carte\b/i,
  /[«"]\s*(appliquer|annuler)\s*[»"]/i,
  /\btouche\s+(sur\s+)?«?\s*appliquer/i,
  /\b(the|a|this) card\b/i,
  /["“]\s*(apply|cancel)\s*["”]/i,
  /\btap\s+(on\s+)?["“]?apply/i,
];

// General or conditional sentence about cards: not an announcement
const GENERAL =
  /\b(quand|lorsque|si|s'il|s’il|chaque fois|dès que|à chaque|en général|when|whenever|if|each time|every time)\b/i;

const sentences = (text: string) =>
  text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

export function claimsCard(answer: string): boolean {
  return sentences(answer).some((s) => CARD_CLAIM.some((p) => p.test(s)) && !GENERAL.test(s));
}

const PLURAL_VOUS =
  /\b(toi et [^.,;!?]+,?\s*vous|vous deux|vous tous|vous toutes|vous trois|entre vous|l'un l'autre|l’un l’autre)\b/i;

export function usesVous(answer: string): boolean {
  return sentences(answer).some((s) => /\bvous\b/i.test(s) && !PLURAL_VOUS.test(s));
}
