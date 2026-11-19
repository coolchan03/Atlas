/**
 * "remind me to call Mom tomorrow at 9", "stretch every weekday at 7:30", "check the oven in 20 minutes": one sentence becomes a scheduled
 * task, with no AI involved (so it works off-grid and instantly). Pure; the clock is passed in. Words it understands: today, tonight,
 * tomorrow, a weekday name, "every day / weekday(s) / <weekday>", "in N minutes / hours / days", "at 9", "at 7:30pm", and "morning /
 * afternoon / evening" as 9:00 / 15:00 / 18:00.
 */
import type { Repeat } from './due';

interface QuickReminder { text: string; repeat: Repeat; hour: number; minute: number; weekday?: number; onceAt?: number }
export type QuickResult = { ok: true; reminder: QuickReminder } | { ok: false; error: string };

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY = 864e5;
const at = (base: number, hour: number, minute: number): number => { const d = new Date(base); d.setHours(hour, minute, 0, 0); return d.getTime(); };

function clock(text: string): { hour: number; minute: number; rest: string } | null {
  const m = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b|\bat\s+(\d{1,2})(?::(\d{2}))?\b/i.exec(text);
  if (!m) {
    const part = /\b(morning|afternoon|evening|tonight|noon)\b/i.exec(text);
    if (!part) return null;
    const hour = { morning: 9, noon: 12, afternoon: 15, evening: 18, tonight: 20 }[part[1].toLowerCase() as 'morning'];
    return { hour, minute: 0, rest: text };
  }
  let hour = Number(m[1] ?? m[4]);
  const minute = Number(m[2] ?? m[5] ?? 0);
  const ap = (m[3] ?? '').toLowerCase().replace(/\./g, '');
  if (ap) { hour %= 12; if (ap === 'pm') hour += 12; }
  if (hour > 23 || minute > 59) return null;
  return { hour, minute, rest: text.replace(m[0], ' ') };
}

/** "in 20 minutes", "in 2 hours", "in 3 days": the reminder, or null when the sentence has no such phrase. */
function relative(text: string, now: number): QuickResult | null {
  const rel = /\bin\s+(\d{1,3})\s*(minutes?|mins?|hours?|hrs?|days?)\b/i.exec(text);
  if (!rel) return null;
  const n = Number(rel[1]);
  const unit = rel[2].toLowerCase();
  const when = new Date(now + (unit.startsWith('d') ? n * DAY : unit.startsWith('h') ? n * 36e5 : n * 6e4));
  const rest = clean(text.replace(rel[0], ' '));
  if (!rest) return { ok: false, error: 'Say what to remind you of.' };
  return { ok: true, reminder: { text: rest, repeat: 'once', hour: when.getHours(), minute: when.getMinutes(), onceAt: at(when.getTime(), when.getHours(), when.getMinutes()) } };
}

/** "every day / weekday / Monday", "daily", "weekdays": what repeats, and the sentence without that phrase. */
function repetition(text: string): { repeat: Repeat; weekday?: number; rest: string } {
  const every = /\bevery\s+(day|weekday|weekdays|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b|\b(daily|weekdays)\b/i.exec(text);
  if (!every) return { repeat: 'once', rest: text };
  const w = (every[1] ?? every[2]).toLowerCase();
  const rest = text.replace(every[0], ' ');
  if (w === 'day' || w === 'daily') return { repeat: 'daily', rest };
  if (w === 'weekday' || w === 'weekdays') return { repeat: 'weekdays', rest };
  return { repeat: 'weekly', weekday: DAYS.indexOf(w), rest };
}

/** "today", "tonight", "tomorrow", "on Friday": how many days ahead (null: none named), whether a weekday was named, and the sentence without it. */
function singleDay(text: string, now: number): { offset: number | null; named: boolean; rest: string } {
  const named = /\b(?:on\s+|next\s+|this\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.exec(text);
  if (/\btomorrow\b/i.test(text)) return { offset: 1, named: false, rest: text.replace(/\btomorrow\b/i, ' ') };
  if (/\btonight\b/i.test(text)) return { offset: 0, named: false, rest: text }; // clock() reads "tonight" as 20:00
  if (/\btoday\b/i.test(text)) return { offset: 0, named: false, rest: text.replace(/\btoday\b/i, ' ') };
  if (named) return { offset: (DAYS.indexOf(named[1].toLowerCase()) - new Date(now).getDay() + 7) % 7, named: true, rest: text.replace(named[0], ' ') };
  return { offset: null, named: false, rest: text };
}

export function parseReminder(input: string, now: number): QuickResult {
  let text = input.trim().replace(/\s+/g, ' ');
  if (!text) return { ok: false, error: 'Say what to remind you of, and when.' };
  text = text.replace(/^(?:please\s+)?(?:remind me|reminder)\s*(?:to\s+|about\s+|that\s+)?/i, '');
  const soon = relative(text, now);
  if (soon) return soon;

  const { repeat, weekday, rest: afterRepeat } = repetition(text);
  const day = repeat === 'once' ? singleDay(afterRepeat, now) : { offset: null, named: false, rest: afterRepeat };
  const t = clock(day.rest);
  if (!t) return { ok: false, error: 'Add a time, like "at 9am", "tonight", or "in 20 minutes".' };
  const what = clean(t.rest.replace(/\btonight\b/i, ' '));
  if (!what) return { ok: false, error: 'Say what to remind you of.' };
  if (repeat !== 'once') return { ok: true, reminder: { text: what, repeat, hour: t.hour, minute: t.minute, ...(weekday !== undefined ? { weekday } : {}) } };

  let onceAt = at(now + (day.offset ?? 0) * DAY, t.hour, t.minute);
  // "at 9" said at 10 pm means tomorrow; a named day that has passed today, or "tomorrow" that is somehow past, means next week.
  if (onceAt <= now) onceAt += day.named || (day.offset ?? 0) > 0 ? 7 * DAY : DAY;
  return { ok: true, reminder: { text: what, repeat: 'once', hour: t.hour, minute: t.minute, onceAt } };
}

/** The words left after the time and day were taken out: no stray "to", "at", "on" or punctuation at the ends. */
function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim().replace(/^(?:to|that|about|at|on|and)\s+/i, '').replace(/\s+(?:at|on|to|and|every)$/i, '').replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '').trim();
}
