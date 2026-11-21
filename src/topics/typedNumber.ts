/**
 * Reads the number a learner typed for a calculation. Strict on purpose: text that is not a number is rejected, never
 * quietly turned into 0 or into the digits that happened to be in it ("hello" is not 0 and "5abc10" is not 510).
 * Accepts a sign (+, -, or the typographic minus), a currency symbol, thousands commas or spaces, a decimal point,
 * scientific notation (1.2e-3 or 1.2 x 10^-3), a trailing percent sign or the task's own unit, and an accounting loss in brackets.
 * Pure, so it is tested without a device.
 */
const CURRENCY = '[$\\u20AC\\u00A3\\u00A5]';
const BODY = '(?:\\d{1,3}(?:,\\d{3})+|\\d{1,3}(?: \\d{3})+|\\d+)?(?:\\.\\d+)?';
const PLAIN = new RegExp(`^(${BODY})(?:[eE]([+-]?\\d+))?$`);
const TIMES_TEN = new RegExp(`^(${BODY})\\s*[x\\u00D7*]\\s*10\\s*\\^?\\s*([+-]?\\d+)$`, 'i');

export function parseTypedNumber(text: string, unit = ''): number | null {
  let t = text.trim().replace(/[−‒–]/g, '-');
  if (!t) return null;
  let negative = false;
  const bracketed = /^\(\s*([^()]+?)\s*\)$/.exec(t);
  if (bracketed) { negative = true; t = bracketed[1]; }
  const u = unit.trim();
  if (u && t.toLowerCase().endsWith(u.toLowerCase())) t = t.slice(0, t.length - u.length).trim();
  t = t.replace(/\s*%$/, '');
  // One sign, before or after a currency symbol: "-$5", "$-5", "+5".
  const lead = new RegExp(`^([+-])?\\s*(?:${CURRENCY}\\s*)?([+-])?\\s*`).exec(t);
  const signs = [lead?.[1], lead?.[2]].filter(Boolean);
  if (signs.length > 1) return null;
  if (signs[0] === '-') negative = !negative;
  t = t.slice(lead ? lead[0].length : 0);
  const ten = TIMES_TEN.exec(t);
  const plain = PLAIN.exec(t);
  let value: number;
  if (ten && ten[1] && /\d/.test(ten[1])) value = Number(ten[1].replace(/[, ]/g, '')) * 10 ** Number(ten[2]);
  else if (plain && plain[1] && /\d/.test(plain[1])) value = Number(`${plain[1].replace(/[, ]/g, '')}${plain[2] === undefined ? '' : `e${plain[2]}`}`);
  else return null;
  if (!Number.isFinite(value)) return null;
  return negative && value !== 0 ? -value : value;
}
