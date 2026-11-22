/**
 * What the background AI queue is doing right now: the job running (with a plain label) and how many are waiting behind it. The queue
 * (llmJobQueue) owns this and reports to it; screens only read it (the Task center shows it). A chat reply is not here: it is read
 * from the model itself, because the queue does not run chat.
 */
import { create } from 'zustand';

interface Activity { running: { label: string; since: number } | null; waiting: number }

export const useAiActivity = create<Activity>(() => ({ running: null, waiting: 0 }));

export const aiActivity = {
  /** A job was handed to the queue. */
  queued: () => useAiActivity.setState((s) => ({ waiting: s.waiting + 1 })),
  /** A queued job reached the front and began (first try only: a retry after a chat reply was never "waiting" again). */
  began: (label: string, firstTry: boolean) => useAiActivity.setState((s) => ({ waiting: firstTry ? Math.max(0, s.waiting - 1) : s.waiting, running: { label, since: Date.now() } })),
  /** The job stopped running (finished, failed, or was stopped for a chat reply and will start again). */
  ended: () => useAiActivity.setState({ running: null }),
  /** A queued job left without ever running (it gave up waiting for a chat reply, or was stopped). */
  dropped: () => useAiActivity.setState((s) => ({ waiting: Math.max(0, s.waiting - 1) })),
};

/** The one line that says what the AI is doing. Pure. */
export function describeNow(i: { job: string | null; chat: boolean; waiting: number; seconds?: number }): string {
  const more = i.waiting > 0 ? ` (${i.waiting} more waiting)` : '';
  if (i.job) return `${i.job}${i.seconds && i.seconds >= 5 ? `, ${i.seconds} s so far` : ''}${more}`;
  if (i.chat) return `Answering a chat${more}`;
  return i.waiting > 0 ? `Waiting for the chat to finish${more}` : 'Idle';
}
