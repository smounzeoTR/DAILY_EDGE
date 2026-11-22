// An answer that announces a card ("Appliquer", "la carte"...) while no action was created in
// the turn is logged (llm_calls.detail = card_claimed_without_action) and flagged by the eval.
const CARD_CLAIM = [
  /\b(la|une|cette|ta) carte\b/i,
  /[«"]\s*(appliquer|annuler)\s*[»"]/i,
  /\btouche\s+(sur\s+)?«?\s*appliquer/i,
  /\b(the|a|this) card\b/i,
  /["“]\s*(apply|cancel)\s*["”]/i,
  /\btap\s+(on\s+)?["“]?apply/i,
];

export function claimsCard(answer: string): boolean {
  return CARD_CLAIM.some((p) => p.test(answer));
}
