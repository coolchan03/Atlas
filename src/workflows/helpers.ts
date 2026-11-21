/**
 * Helpers for the everyday jobs. The pattern is always the same: the AI reads or suggests, and plain code checks what
 * it can. A quote the AI claims to have taken from the person's text must really be in it; a recipe must not contain
 * something the person cannot eat; a rewrite must keep every number. What cannot be checked is shown as unchecked.
 */
const clean = (s: string): string => s.toLowerCase().replace(/[^a-z0-9% $.,/:-]+/g, ' ').replace(/\s+/g, ' ').trim();

/** True when `quote` appears in `source`, ignoring case, spacing and punctuation. A very short quote proves nothing. */
export function quoteIn(source: string, quote: unknown): boolean {
  if (typeof quote !== 'string') return false;
  const q = clean(quote);
  return q.length >= 6 && clean(source).includes(q);
}

export const text = (v: unknown, max = 300): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const list = <T>(v: unknown, each: (x: any) => T | null, max = 20): T[] =>
  (Array.isArray(v) ? v : []).slice(0, max).map(each).filter((x): x is T => x !== null);

export interface Claim { text: string; quote: string; verified: boolean }
/** Reads {text, quote} items from the AI and marks each one verified only if its quote is in the source. */
export function claims(raw: unknown, source: string, key = 'text'): Claim[] {
  return list(raw, (x) => {
    const t = text(x?.[key] ?? x?.what ?? x?.do);
    return t ? { text: t + (x?.date ? ` (${text(x.date, 40)})` : '') + (x?.amount ? ` (${text(String(x.amount), 40)})` : ''), quote: text(x?.quote, 240), verified: quoteIn(source, x?.quote) } : null;
  });
}

/** The claims as markdown lines; the ones whose quote was not found are set apart so nobody relies on them. */
export function claimLines(items: Claim[]): { shown: string[]; unchecked: string[] } {
  return {
    shown: items.filter((c) => c.verified).map((c) => `- ${c.text} ("${c.quote}")`),
    unchecked: items.filter((c) => !c.verified).map((c) => `- ${c.text}`),
  };
}

export const section = (title: string, lines: string[]): string => (lines.length ? `## ${title}\n${lines.join('\n')}\n\n` : '');

/** Warnings for jobs where a wrong step can hurt someone. Code decides these, not the AI. */
const HAZARDS: Array<[RegExp, string]> = [
  [/\b(gas (smell|leak)|smell (of )?gas|propane|natural gas)\b/i, 'If you smell gas: leave, do not touch switches or flames, and call the gas company or emergency services from outside.'],
  [/\b(mains|outlet|socket|wiring|breaker|fuse box|circuit|120 ?v|230 ?v|240 ?v|electric(al)? shock|sparks?)\b/i, 'Switch the power off at the breaker and check it is dead before touching anything electrical. If you are not sure, hire an electrician.'],
  [/\b(swollen|bulging|puffed|burning|hot) (battery|phone|laptop)\b|\bbattery (is )?(swollen|bulging|hot|smoking)\b/i, 'A swollen or hot battery can catch fire. Stop using it, do not charge or puncture it, and take it to a battery recycling point.'],
  [/\b(smoke|burning smell|on fire|flames?)\b/i, 'If there is smoke or fire, leave and call emergency services. Do not try to repair it.'],
  [/\b(carbon monoxide|co alarm)\b/i, 'A carbon monoxide alarm means leave the building and call emergency services.'],
  [/\b(refrigerant|freon|a\/c gas|water heater|boiler|furnace)\b/i, 'Boilers, furnaces, water heaters and refrigerant lines need a licensed professional.'],
  [/\b(roof|ladder|chimney)\b/i, 'Work at height is a common cause of serious injury. Use a proper ladder with a helper, or hire someone.'],
  [/\b(asbestos|lead paint|mold|mould)\b/i, 'Asbestos, lead paint and large areas of mould need a specialist. Do not sand, scrape or disturb them.'],
];
export function hazardWarnings(...texts: string[]): string[] {
  const joined = texts.join('\n');
  return HAZARDS.filter(([re]) => re.test(joined)).map(([, warning]) => warning);
}

const STAPLES = ['salt', 'pepper', 'oil', 'water', 'butter', 'sugar', 'flour', 'vinegar', 'garlic', 'onion'];
const words = (s: string): string[] => clean(s).split(' ').filter((w) => w.length > 2).map((w) => w.replace(/(es|s)$/, ''));

/** Items a recipe needs that are not among the person's items or common staples. */
export function missingItems(pantry: string[], needed: string[]): string[] {
  const have = new Set([...pantry.flatMap(words), ...STAPLES]);
  return needed.filter((n) => { const w = words(n); return w.length > 0 && !w.some((x) => have.has(x)); });
}

/** Ingredients that contain something the person said they cannot eat. */
export function allergenHits(ingredients: string[], avoid: string): string[] {
  const banned = avoid.split(/[,;\n]| and /i).flatMap(words);
  if (!banned.length) return [];
  return ingredients.filter((i) => words(i).some((w) => banned.includes(w)));
}

/** Every number written in the original must still be in the rewrite. Returns the ones that went missing. */
export function lostNumbers(original: string, rewrite: string): string[] {
  const nums = (s: string) => s.match(/\d[\d,.:/-]*\d|\d/g) ?? [];
  const kept = new Set(nums(rewrite));
  return [...new Set(nums(original))].filter((n) => !kept.has(n));
}
