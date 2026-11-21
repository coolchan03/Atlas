/** Current date and time text for prompts (on-device models have no clock). Pure apart from reading the clock. Split from generationToolLoop.ts. */

// Shared current-time parts, computed at send-time (on-device models have no clock).
export function nowParts() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  let dayOfWeek = '';
  let tz = '';
  try {
    dayOfWeek = now.toLocaleDateString(undefined, { weekday: 'long' });
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    // toLocaleDateString/Intl can be unavailable on some JS engines; date alone still helps.
  }
  return { dateStr, timeStr, dayOfWeek, tz };
}

/**
 * Date-only context for the SYSTEM prompt. On-device models have no clock, so this
 * lets them resolve day-relative phrasing ("tomorrow", "next Friday"). The date only
 * changes once a day, so the system prompt + tool schemas stay byte-identical across
 * turns and the (expensive ~800-token) prefix is reused from llama.rn's cache instead
 * of being re-prefilled every turn. The exact time lives elsewhere (see below) so it
 * never busts this prefix.
 */
export function buildDateContext(parts: ReturnType<typeof nowParts>): string {
  const { dateStr, dayOfWeek, tz } = parts;
  const dayPart = dayOfWeek ? ` Today is ${dayOfWeek}.` : '';
  const tzPart = tz ? ` Timezone: ${tz}.` : '';
  return `\n\nThe current date is ${dateStr} (device local date, format YYYY-MM-DD).${dayPart}${tzPart} When the user refers to relative dates such as "today", "tomorrow", or "next Friday", resolve them against this current date.`;
}

/**
 * Exact current time, appended to the LATEST USER MESSAGE rather than the system
 * prompt. The latest user turn is new (uncached) every time anyway, so carrying the
 * volatile timestamp here costs nothing extra and keeps the system+tools prefix
 * stable for cache reuse. Lets the model resolve "now" / "in half an hour" precisely.
 * Only added when a time-sensitive (calendar) tool is enabled.
 */
export function buildExactTimeNote(parts: ReturnType<typeof nowParts>): string {
  const { dateStr, timeStr, tz } = parts;
  const tzPart = tz ? `, ${tz}` : '';
  return `\n\n(Current local date and time: ${dateStr}T${timeStr}${tzPart}. Use this only to resolve relative times like "now", "right now", or "in half an hour" - do not mention or comment on the current date or time in your reply unless the user explicitly asks.)`;
}

