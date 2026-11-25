import { describeTiming } from './due';
import { useSchedule } from './store';
import type { QuickReminder } from './quickReminder';

/** Saves a reminder as a scheduled task (the way "remind me to..." does) and says when it will go off. */
export function saveReminder(r: QuickReminder): string {
  const timing = { repeat: r.repeat, hour: r.hour, minute: r.minute, ...(r.weekday !== undefined ? { weekday: r.weekday } : {}), ...(r.onceAt !== undefined ? { onceAt: r.onceAt } : {}) };
  useSchedule.getState().add({ name: r.text.slice(0, 60), kind: 'prompt', prompt: `This is a reminder I set for myself: "${r.text}". Remind me in one short sentence.`, ...timing });
  return describeTiming({ ...timing, createdAt: Date.now() }).toLowerCase();
}
