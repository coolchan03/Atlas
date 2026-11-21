/**
 * Background alarms for scheduled tasks. The phone's alarm service shows a notification at each task's time (tap it and
 * Atlas opens on Scheduled tasks, where the due task runs). The next few runs of every task are handed over at once, so
 * the notifications keep coming for about two weeks even if Atlas is not opened in between; opening Atlas fills them up.
 */
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { nextOccurrence } from './due';
import { useSchedule, type ScheduledTask } from './store';

/** How many upcoming runs per task get a notification. */
export const RUNS_AHEAD = 10;

export interface AlarmEntry { id: string; at: number; title: string; body: string }

/** The notifications for all switched-on tasks: their next [RUNS_AHEAD] times each. Pure. */
export function alarmsFor(tasks: ScheduledTask[], now: number): AlarmEntry[] {
  const out: AlarmEntry[] = [];
  for (const task of tasks) {
    if (!task.enabled) continue;
    let from = now;
    for (let n = 0; n < RUNS_AHEAD; n++) {
      const at = nextOccurrence(task, from);
      if (at === null) break;
      out.push({
        id: `${task.id}:${at}`, at, title: task.name,
        body: task.kind === 'briefing' ? 'Your daily briefing is ready to make. Tap to open Atlas.' : 'Time for your scheduled task. Tap to open Atlas and run it.',
      });
      from = at;
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, 200);
}

const native = () => (Platform.OS === 'android' ? NativeModules.AtlasTaskAlarms : undefined);
export const alarmsAvailable = () => !!native();

/** Asks for the notification permission (Android 13 and up). Returns whether notifications can be shown. */
export async function askForNotifications(): Promise<boolean> {
  const module = native();
  if (!module) return false;
  try {
    if (Number(Platform.Version) >= 33) {
      const result = await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS' as any);
      if (result !== PermissionsAndroid.RESULTS.GRANTED) return false;
    }
    return !!(await module.notificationsEnabled());
  } catch { return false; }
}

/** Hands the current alarms to the phone (replacing the old ones). Safe to call often. True only when the phone accepted them. */
export async function syncAlarms(now = Date.now()): Promise<boolean> {
  const module = native();
  if (!module) return false;
  try { await module.setAlarms(JSON.stringify(alarmsFor(useSchedule.getState().tasks, now))); return true; } catch { return false; /* alarms are a convenience */ }
}

export type NotificationStatus = 'ready' | 'off' | 'unavailable';

/** Whether notifications can be shown right now, WITHOUT asking: this phone build cannot schedule alarms, they are switched off, or they work. */
export async function notificationStatus(): Promise<NotificationStatus> {
  const module = native();
  if (!module) return 'unavailable';
  try { return (await module.notificationsEnabled()) ? 'ready' : 'off'; } catch { return 'unavailable'; }
}

/** Checks the reminder really is set up: the alarms are handed over and notifications can be shown. */
export async function checkReminders(): Promise<{ status: NotificationStatus; handedOver: boolean }> {
  const handedOver = await syncAlarms();
  return { status: await notificationStatus(), handedOver };
}

/** One honest sentence about whether a reminder will appear. A saved schedule is not the same as a notification that will show. */
export function notificationNote(check: { status: NotificationStatus; handedOver: boolean }): string {
  if (check.status === 'unavailable') return 'No notification will appear: this phone cannot schedule alarms for Atlas. The task still runs when Atlas is open at that time.';
  if (check.status === 'off') return 'Notifications are switched off for Atlas, so no reminder will appear yet. Allow them in Settings > Scheduled tasks or the phone\'s app settings. The task still runs when Atlas is open at that time.';
  if (!check.handedOver) return 'The schedule is saved, but the phone\'s alarm service did not accept the reminder, so it may not appear. Open Settings > Scheduled tasks to try again.';
  return 'A notification will appear at that time.';
}

/** Keeps the alarms in step with the task list while the app runs. Returns the way to stop. */
export function startAlarmSync(): () => void {
  void syncAlarms();
  let last = useSchedule.getState().tasks;
  return useSchedule.subscribe((s) => {
    // A run only changes the bookkeeping fields; the alarms follow the schedule fields and the switch.
    const key = (t: ScheduledTask[]) => JSON.stringify(t.map((x) => [x.id, x.name, x.kind, x.repeat, x.hour, x.minute, x.weekday, x.onceAt, x.enabled]));
    if (key(s.tasks) !== key(last)) void syncAlarms();
    last = s.tasks;
  });
}
