/**
 * The date shown beside a chat in a list: the time for today, "Yesterday", the weekday for the last week, then month and day.
 * Days are counted on the calendar (midnight to midnight), not in blocks of 24 hours: a message from 11 pm last night is "Yesterday" at 8 am,
 * not "9:00 PM". A time in the future, or one that cannot be read, is shown as a time (or nothing), never as "Yesterday".
 */
export function formatChatDate(value: string | number | Date, now: Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (days <= 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
