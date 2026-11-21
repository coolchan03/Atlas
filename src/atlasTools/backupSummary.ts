/**
 * What is inside a backup file, in plain words, without restoring anything: so a backup can be checked before it is needed.
 * Pure, so it is tested without a device.
 */
import { EXCLUDED_BACKUP_KEYS, RESTORABLE_STORE_KEYS } from './backupKeys';

const state = (items: Record<string, unknown>, key: string): Record<string, any> | null => {
  const raw = items[key];
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw)?.state ?? null; } catch { return null; }
};
const count = (v: unknown): number => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export interface BackupReport { lines: string[]; restorable: number; skipped: string[]; problems: string[] }

export function describeBackup(data: { version?: number; items?: Record<string, unknown>; projectFiles?: Array<{ size?: number }> }): BackupReport {
  const items = data.items ?? {};
  const lines: string[] = [];
  const add = (n: number, one: string, many?: string) => { if (n) lines.push(plural(n, one, many)); };
  add(count(state(items, 'local-llm-chat-storage')?.conversations), 'chat');
  add(count(state(items, 'local-llm-project-storage')?.projects), 'project');
  add(count(state(items, 'atlas-agent-storage')?.agents), 'agent');
  add(count(state(items, 'atlas-topics')?.courses), 'course');
  add(count(state(items, 'atlas-exercises')?.exercises), 'practice question');
  add(count(state(items, 'atlas-cpa-prep')?.exams), 'exam set up for prep', 'exams set up for prep');
  add(count(state(items, 'atlas-custom-home-shortcuts-v1')?.shortcuts), 'Home widget');
  add(count(state(items, 'atlas-recordings')?.recordings), 'recording');
  const files = data.projectFiles ?? [];
  if (files.length) lines.push(`${plural(files.length, 'project document')} (${Math.round(files.reduce((n, f) => n + (f.size ?? 0), 0) / 1048576)} MB)`);
  const keys = Object.keys(items);
  const restorable = keys.filter((k) => RESTORABLE_STORE_KEYS.has(k) && !EXCLUDED_BACKUP_KEYS.test(k) && typeof items[k] === 'string');
  const skipped = keys.filter((k) => !restorable.includes(k));
  const problems: string[] = [];
  if (!restorable.length) problems.push('Nothing in this file can be restored.');
  for (const k of restorable) { try { JSON.parse(items[k] as string); } catch { problems.push(`${k} is damaged and would be skipped.`); } }
  if (data.version === 1 && !files.length) lines.push('no project documents (a plain backup never holds them)');
  return { lines, restorable: restorable.length, skipped, problems };
}

export const formatBackupReport = (r: BackupReport): string => [
  r.lines.length ? `Holds ${r.lines.join(', ')}.` : 'Holds no chats, projects or courses.',
  `${plural(r.restorable, 'part')} would be restored${r.skipped.length ? `; ${r.skipped.length} left out on purpose (keys, locks and device settings)` : ''}.`,
  ...r.problems,
  'Nothing was changed on this phone.',
].join('\n\n');
