// Internal identifiers (E033, H27, P002, PR1, S01) never reach the user, even if the model writes
// one: removed from the streamed text. A possible identifier cut between two chunks is held back
// until the next chunk.
const ID = /\s*\(\s*(?:PR|[EHPS])\d{1,3}\s*\)|\b(?:PR|[EHPS])\d{1,3}\b/g;
const PARTIAL = /(?:\(\s*)?\b(?:PR|[EHPS]|P)\d{0,3}$/;

export function removeIdentifiers(text: string): string {
  return text
    .replace(ID, '')
    .replace(/ {2,}/g, ' ')
    .replace(/ ([,.;:!?])/g, '$1');
}

export function createIdentifierFilter() {
  let held = '';
  let last = '';
  // No double space where an identifier was removed across two chunks
  const out = (text: string) => {
    const clean = last.endsWith(' ') ? text.replace(/^ +/, '') : text;
    if (clean) last = clean;
    return clean;
  };
  return {
    // Text safe to show now
    push(chunk: string): string {
      const text = held + chunk;
      const partial = PARTIAL.exec(text);
      held = partial ? text.slice(partial.index) : '';
      return out(removeIdentifiers(partial ? text.slice(0, partial.index) : text));
    },
    // Remaining text at the end of the turn
    flush(): string {
      const rest = out(removeIdentifiers(held));
      held = '';
      return rest;
    },
  };
}
