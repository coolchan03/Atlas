/**
 * Generate a unique ID using crypto.getRandomValues when available,
 * with a Date.now()-based fallback for environments where the Web Crypto
 * API is not exposed (e.g. older Hermes builds on Android).
 */
let sequence = 0;
export function generateId(): string {
  let random: string;
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    random = array[0].toString(36);
  } else {
    // Fallback (Hermes on Android has no Web Crypto): random bits plus a counter that never repeats, so two ids made in the same
    // millisecond (a loop adding voices, messages or widgets) can never be the same. Not cryptographically secure, but fine for local IDs.
    random = `${Math.floor(Math.random() * 2 ** 30).toString(36)}${(sequence++).toString(36)}`; // NOSONAR
  }
  return `${Date.now()}-${random}`;
}

/**
 * Generate a random seed for image generation.
 */
export function generateRandomSeed(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % 2147483647;
  }
  // Fallback for environments without crypto API
  // Not derived from the clock: seeds asked for in the same millisecond (a batch of images) would be identical.
  return Math.floor(Math.random() * 2147483647); // NOSONAR
}
