/**
 * Tolerant JSON extraction for small on-phone models: strips code fences and
 * chatter, takes the outermost object or array, and repairs trailing commas and
 * smart quotes. Returns null when nothing parseable is found.
 */
export function parseJsonLoose<T = any>(raw: string): T | null {
  if (!raw) return null;
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
  const firstObj = text.indexOf('{');
  const firstArr = text.indexOf('[');
  const starts = [firstObj, firstArr].filter((i) => i >= 0);
  if (!starts.length) return null;
  const start = Math.min(...starts);
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  const end = text.lastIndexOf(close);
  if (end <= start) return null;
  text = text.slice(start, end + 1)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(text) as T; } catch { /* try a repair below */ }
  // Common small-model mistake: unquoted keys.
  try { return JSON.parse(text.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')) as T; } catch { return null; }
}

/** Citation numbers from a value the model returned (number, "2", "[2]", [1, 3]). */
export function srcList(value: unknown, valid: number[]): number[] {
  const raw = Array.isArray(value) ? value : [value];
  const nums = raw.flatMap((v) => String(v ?? '').match(/\d+/g) ?? []).map(Number);
  return [...new Set(nums.filter((n) => valid.includes(n)))];
}

export const str = (v: unknown, max = 400): string => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
