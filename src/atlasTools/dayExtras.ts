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
export function specialDays(titles: string[], when: 'Today' | 'Tomorrow' = 'Today'): { said: string; rest: string[] } {
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
  return { said: `${when} is ${list}.`, rest };
}

/** "You are on a 5-day study streak." From three days on. `days` is the app's own streak (study/progress.ts `streakFrom`, one missed day a week forgiven). */
export function streakLine(days: number): string {
  return days >= 3 ? `You are on a ${days}-day study streak.` : '';
}

/** "You have 12 review cards due: 7 in FAR and 5 in REG." (the three projects with most cards are named). */
export function reviewsDueSpoken(due: Array<{ project: string }>): string {
  if (!due.length) return '';
  const counts = new Map<string, number>();
  for (const d of due) counts.set(d.project, (counts.get(d.project) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([project, n]) => `${n} in ${project}`);
  const list = top.length > 1 ? `${top.slice(0, -1).join(', ')} and ${top[top.length - 1]}` : top[0];
  return `You have ${due.length} review card${due.length === 1 ? '' : 's'} due: ${list}.`;
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
