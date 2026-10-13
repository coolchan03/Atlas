/**
 * Field ID safety net, applied in code to every Field ID reply (the prompt alone
 * is not enough: small on-phone vision models ignore instructions).
 *
 * - Mushrooms / fungi: a photo can never establish that one is safe to eat, so an
 *   EDIBLE / "safe to eat" verdict is rewritten to NOT SURE with a warning.
 * - Plants and berries: an EDIBLE verdict keeps the text but always gets a warning
 *   about lookalikes and the need for an expert or a trusted local guide.
 */
const FUNGI = /\b(mushrooms?|fung(?:us|i)|toadstools?|amanitas?|boletes?|chanterelles?|morels?|puffballs?|agarics?|mycel\w*|death\s*caps?|destroying\s*angels?)\b/i;
const PLANTS = /\b(plants?|berr(?:y|ies)|leaf|leaves|roots?|tubers?|seeds?|fruits?|nuts?|flowers?|herbs?|weeds?|greens?)\b/i;
// "edible", "safe to eat", "ok to eat"... A claim right after "not", "never",
// "in-" or "non-" is a negation, so it is left alone (checked without regex
// lookbehind, which older Hermes builds lack).
const EDIBLE_WORDS = /(edible|safe\s+to\s+eat|ok(?:ay)?\s+to\s+eat|fine\s+to\s+eat|good\s+to\s+eat)\b/gi;
const NEGATED_BEFORE = /(?:\bnot|\bnever|\bno|\bin|\bnon-?|\bun)\s*$/i;

function forEachClaim(text: string, fn: (start: number, end: number) => void): void {
  EDIBLE_WORDS.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EDIBLE_WORDS.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    const prevChar = m.index > 0 ? text[m.index - 1] : ' ';
    if (/[a-z]/i.test(prevChar) && !/-$/.test(before)) continue; // part of a longer word
    if (NEGATED_BEFORE.test(before)) continue;
    fn(m.index, m.index + m[0].length);
  }
}

export function hasEdibleClaim(text: string): boolean {
  let found = false;
  forEachClaim(text, () => { found = true; });
  return found;
}

export const MUSHROOM_WARNING =
  'NOT SURE: never eat a wild mushroom identified from a photo. Deadly species (death cap, destroying angel) look like edible ones, and no app can tell them apart reliably.';
export const PLANT_WARNING =
  'Safety: do not eat any wild plant based on a photo alone. Check the lookalikes in person with an expert or a trusted local field guide first.';

export function enforceForageSafety(text: string): string {
  if (!text || !hasEdibleClaim(text)) return text;
  if (FUNGI.test(text)) {
    const spans: Array<[number, number]> = [];
    forEachClaim(text, (a, b) => spans.push([a, b]));
    let out = text;
    for (const [a, b] of spans.reverse()) out = `${out.slice(0, a)}NOT SURE (not confirmed edible)${out.slice(b)}`;
    return `**${MUSHROOM_WARNING}**\n\n${out}`;
  }
  if (PLANTS.test(text) && !text.includes(PLANT_WARNING)) {
    return `${text}\n\n**${PLANT_WARNING}**`;
  }
  return text;
}
