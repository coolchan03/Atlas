/** WorkManager notifications for drafts. No SMS is sent by Atlas. */
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import * as DT from '../../atlasTools/deviceTools';

interface ScheduledDraft { id: string; scheduledAt?: number; status: string }

function bridge() {
  if (Platform.OS !== 'android' || !NativeModules.AtlasScheduledDrafts) {
    throw new Error('Scheduled drafts require the updated Atlas Android app.');
  }
  return NativeModules.AtlasScheduledDrafts;
}

/** Require an explicit date/time rather than guessing ambiguous text. */
export function scheduledTime(text: string, now = Date.now()): number {
  const at = Date.parse(text);
  if (!Number.isFinite(at) || at - now < 60_000 || at - now > 366 * 86400000) {
    throw new Error('Choose a future time between one minute and one year from now.');
  }
  return at;
}

export async function scheduleTextDraft(to: string, body: string, time: string): Promise<string> {
  const native = bridge();
  const phone = to.replace(/[\s().-]/g, '');
  if (!/^\+?[0-9]{3,20}$/.test(phone)) throw new Error('Enter a valid phone number.');
  if (!body.trim() || body.length > 1200) throw new Error('Enter 1-1200 characters.');
  const due = scheduledTime(time);
  const ok = await DT.confirm('Schedule text draft?', `To: ${phone}\nWhen: ${new Date(due).toLocaleString()}\n\n${body.slice(0, 400)}${body.length > 400 ? '…' : ''}\n\nYou will get a notification, not an automatically sent text. Android may delay it.`, 'Schedule');
  if (!ok) return 'The user declined. No draft was scheduled.';
  if (Number(Platform.Version) >= 33) {
    const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
      return 'Notification permission was denied; nothing was scheduled.';
    }
  }
  const id: string = await native.schedule(phone, body, due);
  return `Scheduled a text-draft notification for ${new Date(due).toLocaleString()}. ID: ${id}. The user must review and send the text.`;
}
export async function listScheduledTextDrafts(): Promise<string> {
  const jobs: ScheduledDraft[] = await bridge().list();
  return jobs.length
    ? jobs.map(j => `- ${j.id}: ${j.scheduledAt ? new Date(j.scheduledAt).toLocaleString() : 'time unavailable'} (${j.status})`).join('\n')
    : 'No scheduled text drafts are pending.';
}
export async function cancelScheduledTextDraft(id: string): Promise<string> {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)) {
    throw new Error('Enter a valid scheduled-draft ID.');
  }
  await bridge().cancel(id);
  return `Cancelled scheduled draft ${id}. No text was sent.`;
}
