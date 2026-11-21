/**
 * The briefing's "your day" line: the scheduled tasks that will run later today and, when it matters, a note that the phone's battery
 * is low. Spoken after the weather and the calendar. Pure (the clock, the tasks and the battery are passed in), so it is tested
 * without a phone. Briefing tasks themselves are left out (that is this very briefing).
 */
import { nextOccurrence } from '../schedule/due';
import type { ScheduledTask } from '../schedule/store';

const at = (ms: number): string => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const join = (items: string[]): string => (items.length > 1 ? `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}` : items[0] ?? '');

export interface DayInputs { tasks: ScheduledTask[]; now: number; batteryPercent?: number | null; charging?: boolean; /** 'tomorrow' (the evening briefing) names tomorrow's tasks and leaves the battery out. */ when?: 'today' | 'tomorrow' }

export function daySpoken({ tasks, now, batteryPercent, charging, when = 'today' }: DayInputs): string {
  const dayStart = new Date(now); dayStart.setHours(23, 59, 59, 999); // the end of today
  const from = when === 'tomorrow' ? dayStart.getTime() : now;
  const to = when === 'tomorrow' ? dayStart.getTime() + 864e5 : dayStart.getTime();
  const todays = tasks
    .filter((t) => t.enabled && t.kind !== 'briefing')
    .map((t) => ({ name: t.name, when: nextOccurrence(t, from) }))
    .filter((t): t is { name: string; when: number } => t.when !== null && t.when <= to)
    .sort((a, b) => a.when - b.when);
  const parts: string[] = [];
  if (todays.length) {
    const shown = todays.slice(0, 4).map((t) => `${t.name} at ${at(t.when)}`);
    const more = todays.length > 4 ? `, and ${todays.length - 4} more` : '';
    parts.push(`${when === 'tomorrow' ? 'Tomorrow' : 'Later today'}, Atlas has ${join(shown)}${more} scheduled.`);
  }
  if (when === 'today' && typeof batteryPercent === 'number' && batteryPercent <= 30 && !charging) {
    parts.push(`Your phone is at ${Math.round(batteryPercent)} percent, so charge it before a long day.`);
  }
  return parts.join(' ');
}
