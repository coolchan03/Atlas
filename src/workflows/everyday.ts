/**
 * Two more jobs on the same engine. Meeting follow-ups: a transcript to a summary and action items, with reminders
 * for the ones that have a date. Bills and warranties: the text of a bill to who, how much and when, with a reminder
 * before it is due. The AI reads; code checks every value (dates must be real, amounts must be numbers) and the
 * person approves before anything is saved or scheduled.
 */
import { extractJson, type Workflow } from './engine';

export interface ActionItem { text: string; due?: string }
export interface MeetingCtx { transcript: string; title: string; summary?: string; actions?: ActionItem[]; note?: string; reminders?: number }
export interface BillCtx { text: string; vendor?: string; cents?: number; due?: string; kind?: 'bill' | 'warranty'; reminderDays: number; reminded?: boolean }

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** A YYYY-MM-DD string only when it is a real calendar date. */
export function realDate(text: unknown): string | undefined {
  if (typeof text !== 'string' || !ISO.test(text)) return undefined;
  const d = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text ? undefined : text;
}

export function readMeeting(reply: string): { summary: string; actions: ActionItem[] } {
  const json = extractJson(reply) as { summary?: unknown; actions?: unknown } | null;
  const summary = typeof json?.summary === 'string' ? json.summary.trim().slice(0, 1500) : '';
  if (!summary) throw new Error('The AI did not return a summary. Try again, or use a larger model.');
  const actions = (Array.isArray(json?.actions) ? json!.actions as Array<{ text?: unknown; due?: unknown }> : [])
    .filter((a) => typeof a?.text === 'string' && a.text.trim())
    .slice(0, 20)
    .map((a) => ({ text: String(a.text).trim().slice(0, 200), due: realDate(a.due) }));
  return { summary, actions };
}

const markdown = (ctx: MeetingCtx): string =>
  `# ${ctx.title}\n\n## Summary\n${ctx.summary}\n\n## Action items\n${(ctx.actions ?? []).map((a) => `- [ ] ${a.text}${a.due ? ` (by ${a.due})` : ''}`).join('\n') || '- None found'}\n`;

/** A reminder at 9:00 local time on a day, as a scheduled task. Used by both jobs. */
export function scheduleReminder(name: string, prompt: string, day: string): void {
  const { useSchedule } = require('../schedule/store');
  const [y, m, d] = day.split('-').map(Number);
  const at = new Date(y, m - 1, d, 9, 0, 0).getTime();
  useSchedule.getState().add({ name, kind: 'prompt', prompt, repeat: 'once', hour: 9, minute: 0, onceAt: at });
}

export const meeting: Workflow<MeetingCtx> = {
  id: 'meeting',
  title: 'Meeting to follow-ups',
  summary: 'Turns a meeting transcript into a summary and action items, and reminds you of the ones with a date.',
  input: { help: 'Paste a transcript, or choose one of your recordings.', minChars: 80, fromRecording: true,
    fields: [{ id: 'title', label: 'Meeting name', placeholder: 'Meeting name' }],
    make: (text, fields) => ({ transcript: text, title: (fields.title ?? '').trim() || 'Meeting' }) },
  steps: [
    { kind: 'code', id: 'check', title: 'Check the transcript', run: (ctx) => {
      if (ctx.transcript.trim().length < 80) throw new Error('The transcript is too short to summarise.');
      return {};
    } },
    { kind: 'model', id: 'summarise', title: 'Summarise and find action items', run: async (ctx, ask) => readMeeting(await ask(
      'You write meeting notes. Reply with JSON only: {"summary":"3 to 6 sentences","actions":[{"text":"who does what","due":"YYYY-MM-DD or omit"}]}. Use only what was said. Do not invent tasks or dates.',
      ctx.transcript.slice(0, 12000),
    )) },
    { kind: 'confirm', id: 'approve', title: 'Approve', summary: (ctx) =>
      `${ctx.summary}\n\nAction items:\n${(ctx.actions ?? []).map((a) => `- ${a.text}${a.due ? ` (by ${a.due})` : ''}`).join('\n') || '- None found'}\n\nApprove to make the note${(ctx.actions ?? []).some((a) => a.due) ? ' and set a reminder for each dated item' : ''}.` },
    { kind: 'code', id: 'save', title: 'Make the note and reminders', run: (ctx) => {
      const dated = (ctx.actions ?? []).filter((a) => a.due);
      dated.forEach((a) => scheduleReminder(`Follow up: ${a.text.slice(0, 40)}`, `Remind me: ${a.text}. It is due ${a.due}.`, a.due!));
      return { note: markdown(ctx), reminders: dated.length };
    } },
  ],
};

export function readBill(reply: string): { vendor: string; cents: number; due: string; kind: 'bill' | 'warranty' } {
  const json = extractJson(reply) as { vendor?: unknown; amount?: unknown; due?: unknown; kind?: unknown } | null;
  const vendor = typeof json?.vendor === 'string' ? json.vendor.trim().slice(0, 80) : '';
  const amount = typeof json?.amount === 'number' ? json.amount : Number(String(json?.amount ?? '').replace(/[$,]/g, ''));
  const due = realDate(json?.due);
  if (!vendor) throw new Error('No company name was found in the text.');
  if (!due) throw new Error('No due or expiry date was found. Add it to the text and try again.');
  const kind = json?.kind === 'warranty' ? 'warranty' : 'bill';
  if (kind === 'bill' && !(Number.isFinite(amount) && amount > 0)) throw new Error('No amount was found in the text.');
  return { vendor, cents: Number.isFinite(amount) ? Math.round(amount * 100) : 0, due, kind };
}

export const bill: Workflow<BillCtx> = {
  id: 'bill',
  title: 'Bill or warranty reminder',
  summary: 'Reads a bill or warranty, shows who, how much and when, and sets a reminder before it is due.',
  input: { help: 'Paste the text of a bill or warranty, or choose a file.', minChars: 20,
    fields: [{ id: 'days', label: 'Remind me', options: ['1 day before', '3 days before', '7 days before'] }],
    make: (text, fields) => ({ text, reminderDays: Number.parseInt(fields.days ?? '3', 10) || 3 }) },
  steps: [
    { kind: 'model', id: 'extract', title: 'Read the bill', run: async (ctx, ask) => readBill(await ask(
      'You read bills and warranty papers. Reply with JSON only: {"vendor":"company","amount":123.45,"due":"YYYY-MM-DD","kind":"bill" or "warranty"}. For a warranty, "due" is the expiry date. Use only what the text says.',
      ctx.text.slice(0, 8000),
    )) },
    { kind: 'confirm', id: 'approve', title: 'Approve', summary: (ctx) =>
      `${ctx.kind === 'warranty' ? 'Warranty' : 'Bill'} from ${ctx.vendor}${ctx.kind === 'bill' ? `, ${(ctx.cents! / 100).toFixed(2)}` : ''}, ${ctx.kind === 'warranty' ? 'expires' : 'due'} ${ctx.due}.\n\nApprove to be reminded ${ctx.reminderDays} day${ctx.reminderDays === 1 ? '' : 's'} before.` },
    { kind: 'code', id: 'remind', title: 'Set the reminder', run: (ctx) => {
      const due = new Date(`${ctx.due}T00:00:00`);
      const remind = new Date(due.getTime() - ctx.reminderDays * 864e5);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const day = (remind < today ? due : remind);
      const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      scheduleReminder(`${ctx.vendor} ${ctx.kind}`, `Remind me: the ${ctx.vendor} ${ctx.kind === 'warranty' ? 'warranty expires' : `bill${ctx.cents ? ` of ${(ctx.cents / 100).toFixed(2)}` : ''} is due`} on ${ctx.due}.`, iso);
      return { reminded: true };
    } },
  ],
};
