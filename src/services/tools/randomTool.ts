/**
 * Random numbers and dice for the chat tools, so a model never has to invent "random" digits. Uses the system's secure random source
 * (Web Crypto) when the phone's JavaScript engine has it, otherwise Math.random; a draw is mapped into its range by rejection, so no
 * number is more likely than another. With a seed the draws are reproducible (for tests and games) and the answer says so.
 */
export type Rng = () => number; // a 32-bit unsigned integer per call

const TWO32 = 4294967296;
export const MAX_COUNT = 1000;
export const MAX_DICE = 100;
export const MAX_SIDES = 1000;

/** True when draws come from a secure source on this phone. */
export const hasSecureRandom = (): boolean => typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function';

/** A system random number generator: Web Crypto when present, else Math.random. */
export function systemRng(): Rng {
  if (hasSecureRandom()) {
    const buf = new Uint32Array(1);
    return () => { crypto.getRandomValues(buf); return buf[0]; };
  }
  return () => Math.floor(Math.random() * TWO32); // NOSONAR — only used when the engine has no Web Crypto
}

/** A reproducible generator (mulberry32) from a whole-number seed. Not random: the same seed gives the same draws. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0);
  };
}

/** A whole number from min to max (both included) with no bias: draws that would favour small results are thrown away. */
export function uniformInt(min: number, max: number, rng: Rng): number {
  const range = max - min + 1;
  if (range === 1) return min;
  const limit = TWO32 - (TWO32 % range);
  let draw = rng();
  while (draw >= limit) draw = rng();
  return min + (draw % range);
}

const whole = (value: unknown, name: string, fallback?: number): number => {
  if (value === undefined || value === null || value === '') {
    if (fallback === undefined) throw new Error(`Missing required parameter: ${name}`);
    return fallback;
  }
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n) || !Number.isSafeInteger(n)) throw new Error(`${name} must be a whole number`);
  return n;
};

const pickRng = (seed: unknown): { rng: Rng; note: string } => {
  if (seed === undefined || seed === null || seed === '') {
    return { rng: systemRng(), note: hasSecureRandom() ? 'secure random source' : 'system random source (no secure source on this phone)' };
  }
  const s = whole(seed, 'seed');
  return { rng: seededRng(s), note: `seeded with ${s}: reproducible, not random` };
};

export interface RandomArgs { min?: unknown; max?: unknown; count?: unknown; unique?: unknown; seed?: unknown }

/** random_number: `count` whole numbers from min to max, optionally all different. */
export function randomNumber(args: RandomArgs): string {
  const min = whole(args.min, 'min', 1);
  const max = whole(args.max, 'max', 100);
  const count = whole(args.count, 'count', 1);
  if (min > max) throw new Error('min must not be greater than max');
  const range = max - min + 1;
  if (range > TWO32) throw new Error('The range min to max is too large (at most 4,294,967,296 numbers)');
  if (count < 1 || count > MAX_COUNT) throw new Error(`count must be from 1 to ${MAX_COUNT}`);
  const unique = args.unique === true || String(args.unique).toLowerCase() === 'true';
  if (unique && count > range) throw new Error(`Cannot draw ${count} different numbers from ${range} possible`);
  const { rng, note } = pickRng(args.seed);
  const out: number[] = [];
  if (unique) {
    const seen = new Set<number>();
    while (out.length < count) {
      const n = uniformInt(min, max, rng);
      if (!seen.has(n)) { seen.add(n); out.push(n); }
    }
  } else {
    for (let i = 0; i < count; i += 1) out.push(uniformInt(min, max, rng));
  }
  return `${out.join(', ')} (${count === 1 ? 'one number' : `${count} numbers`} from ${min} to ${max}${unique ? ', all different' : ''}; ${note})`;
}

export interface DiceArgs { sides?: unknown; count?: unknown; modifier?: unknown; seed?: unknown }

/** roll_dice: `count` dice with `sides` sides, plus an optional modifier. */
export function rollDice(args: DiceArgs): string {
  const sides = whole(args.sides, 'sides', 6);
  const count = whole(args.count, 'count', 1);
  const modifier = whole(args.modifier, 'modifier', 0);
  if (sides < 2 || sides > MAX_SIDES) throw new Error(`sides must be from 2 to ${MAX_SIDES}`);
  if (count < 1 || count > MAX_DICE) throw new Error(`count must be from 1 to ${MAX_DICE}`);
  if (Math.abs(modifier) > 1_000_000) throw new Error('modifier is too large');
  const { rng, note } = pickRng(args.seed);
  const rolls = Array.from({ length: count }, () => uniformInt(1, sides, rng));
  const sum = rolls.reduce((a, b) => a + b, 0);
  const total = sum + modifier;
  const label = `${count}d${sides}${modifier ? (modifier > 0 ? `+${modifier}` : String(modifier)) : ''}`;
  return `${label}: rolls ${rolls.join(', ')}${modifier ? `, modifier ${modifier > 0 ? '+' : ''}${modifier}` : ''}, total ${total} (${note})`;
}
