/**
 * Small lines the daily briefing says after the weather and the calendar: what to pack for tomorrow, birthdays, a study streak, a
 * weekly digest on Mondays, and where you were last. Pure (the clock and the data are passed in), so each rule is tested without a
 * phone. Anything private (locked chats, protected projects, incognito chats) is the caller's to leave out before passing data in.
 */
import type { Units } from './units';

const DAY = 864e5;
const dayKey = (ms: number): string => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export interface DayForecast { tempMaxC: number; precipProbPct?: number; description: string }

/** "Pack for tomorrow: an umbrella and a warmer jacket (it will be 9°F colder)." Said in the evening only, and only when it matters. */
export function packForTomorrow(o: { today: DayForecast; tomorrow?: DayForecast; units: Units; hour: number }): string {
  const { today, tomorrow, units, hour } = o;
  if (!tomorrow || hour < 16) return '';
  const wet = (tomorrow.precipProbPct ?? 0) >= 50 || /rain|drizzle|shower|storm|snow/i.test(tomorrow.description);
  const dropC = today.tempMaxC - tomorrow.tempMaxC;
  const cold = dropC >= 8;
  if (!wet && !cold) return '';
  const drop = Math.round(units.temp === 'f' ? dropC * 9 / 5 : dropC);
  const items = [wet ? (/snow/i.test(tomorrow.description) ? 'something for snow' : 'an umbrella') : '', cold ? 'a warmer jacket' : ''].filter(Boolean);
  return `Pack for tomorrow: ${items.join(' and ')}${cold ? ` (it will be ${drop} degrees colder)` : ''}.`;
}

/** Birthdays and anniversaries among today's calendar events, as "Today is Sam's birthday." (the rest of the events are listed separately). */
export function specialDays(titles: string[]): { said: string; rest: string[] } {
  const special: string[] = [];
  const rest: string[] = [];
  for (const raw of titles) {
    const t = raw.trim();
    const prefixed = /^(birthday|anniversary)\s*[:\-]\s*(.+)$/i.exec(t);
    if (prefixed) special.push(`${prefixed[2]}'s ${prefixed[1].toLowerCase()}`);
    // A bare "Birthday" says nothing about whose it is, so it stays an ordinary event.
    else if (/\b(birthday|anniversary)\b/i.test(t) && !/^(birthday|anniversary)$/i.test(t)) special.push(t);
    else rest.push(raw);
  }
  if (!special.length) return { said: '', rest };
  const list = special.length > 1 ? `${special.slice(0, -1).join(', ')} and ${special[special.length - 1]}` : special[0];
  return { said: `Today is ${list}.`, rest };
}

/** Days in a row, ending today or yesterday, on which something was made. `times` are millisecond timestamps. */
export function studyStreak(times: number[], now: number): { days: number; today: boolean } {
  const have = new Set(times.map(dayKey));
  const today = have.has(dayKey(now));
  let days = 0;
  for (let back = today ? 0 : 1; have.has(dayKey(now - back * DAY)); back++) days += 1;
  return { days, today };
}

/** "You have worked on study material 5 days in a row." Said from 3 days on, and only while the streak is alive (today or yesterday). */
export function streakSpoken(times: number[], now: number): string {
  const { days } = studyStreak(times, now);
  return days >= 3 ? `You have worked on study material ${days} days in a row.` : '';
}

/** Mondays only: what the last 7 days held. */
export function weeklyDigest(items: Array<{ at: number; project: string }>, now: number): string {
  if (new Date(now).getDay() !== 1) return '';
  const week = items.filter((i) => now - i.at < 7 * DAY && now - i.at >= 0);
  if (!week.length) return '';
  const counts = new Map<string, number>();
  for (const i of week) counts.set(i.project, (counts.get(i.project) ?? 0) + 1);
  const [top, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const days = new Set(week.map((i) => dayKey(i.at))).size;
  return `Last week you made ${week.length} study item${week.length === 1 ? '' : 's'} on ${days} day${days === 1 ? '' : 's'}${counts.size > 1 ? `, most of them in ${top} (${topCount})` : ` in ${top}`}.`;
}

/** "Last time you were working on 'Leases'." The newest chat from the last 3 days, if it has messages. */
export function lastWorkedOn(chats: Array<{ title: string; updatedAt: string; messages: number }>, now: number): string {
  const newest = [...chats].filter((c) => c.messages > 0 && c.title.trim()).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  if (!newest) return '';
  const age = now - Date.parse(newest.updatedAt);
  if (Number.isNaN(age) || age < 0 || age > 3 * DAY) return '';
  return `Last time you were working on ${newest.title.trim().slice(0, 60)}.`;
}
