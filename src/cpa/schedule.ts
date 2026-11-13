/** How long is left and what that means for the checklist. Pure. */
const DAY = 86_400_000;

/** A real YYYY-MM-DD date, or undefined. */
export function validDay(text: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  const d = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text ? undefined : text;
}

export interface Pace { daysLeft: number; remaining: number; perWeek: number | null }

/** Days to the exam (negative once it has passed), topics still to understand, and how many a week that takes. */
export function pace(examDate: string | undefined, remaining: number, now = Date.now()): Pace | null {
  const day = examDate && validDay(examDate);
  if (!day) return null;
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((new Date(`${day}T00:00:00`).getTime() - today.getTime()) / DAY);
  return { daysLeft, remaining, perWeek: daysLeft > 0 && remaining > 0 ? Math.ceil((remaining / daysLeft) * 7 * 10) / 10 : null };
}

export function describePace(p: Pace): string {
  if (p.daysLeft < 0) return 'The exam date has passed. Set a new one if you are sitting it again.';
  if (p.daysLeft === 0) return 'The exam is today.';
  const left = `${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'} to go`;
  if (!p.remaining) return `${left}. Every topic is understood: keep reviewing.`;
  return `${left}, ${p.remaining} topic${p.remaining === 1 ? '' : 's'} still to understand: about ${p.perWeek} a week.`;
}
