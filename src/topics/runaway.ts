/**
 * A model that does not stop. Asked for a lesson of a few hundred words, a small model can keep writing (thousands of words, or the same
 * paragraph again and again) until the time limit stops it and the lesson is lost. So a reply is cut short once it is far longer than any
 * real answer of its kind, or once it is repeating itself, and what was written up to then is kept and read as far as it goes. Pure.
 */

/** The most characters a reply of this kind can reasonably have; past it the model is running on. */
export const maxCharsFor = (format: string): number => (format === 'lesson' ? 24000 : 14000);

/** True when the end of the text already appeared at least twice before it: the model is going round in a loop. */
export function isLooping(text: string): boolean {
  if (text.length < 600) return false;
  const tail = text.slice(-140);
  // Table rules and rows of the same few symbols repeat by nature: only a tail with real words in it can be a loop.
  if (tail.replace(/[\s|\-:+_=*#.,0-9]/g, '').length < 60) return false;
  let found = 0;
  for (let at = text.indexOf(tail); at !== -1 && at < text.length - 140; at = text.indexOf(tail, at + 1)) found += 1;
  return found >= 2;
}

/** Why a reply being written should be cut now, or null. */
export const runawayReason = (text: string, maxChars: number): string | null =>
  text.length > maxChars ? `it ran past ${maxChars} characters` : isLooping(text) ? 'it started repeating itself' : null;

const closers = (text: string): string => {
  const stack: string[] = [];
  let inString = false; let escaped = false;
  for (const ch of text) {
    if (inString) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') inString = false; continue; }
    if (ch === '"') inString = true;
    else if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  return `${inString ? '"' : ''}${stack.reverse().join('')}`;
};

/** Where the commas that are not inside a string are. */
const outerCommas = (text: string): number[] => {
  const out: number[] = [];
  let inString = false; let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') inString = false; continue; }
    if (ch === '"') inString = true; else if (ch === ',') out.push(i);
  }
  return out;
};

/**
 * JSON that was cut off in the middle, made readable: the last element that was only partly written is dropped (never shown cut in the
 * middle of a sentence) and what was open is closed. Returns the repaired text, or '' when nothing can be saved.
 */
export function repairCutJson(raw: string): string {
  const start = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').indexOf('{');
  if (start < 0) return '';
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').slice(start);
  const commas = outerCommas(text);
  for (let i = commas.length - 1; i >= Math.max(0, commas.length - 60); i--) {
    const candidate = text.slice(0, commas[i]);
    try { JSON.parse(candidate + closers(candidate)); return candidate + closers(candidate); } catch { /* cut earlier */ }
  }
  return '';
}
