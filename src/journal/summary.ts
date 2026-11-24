/** A short, kind look back at the last week of pages, written by the phone's own AI from what the pages say and nothing else. */
import { askShaped } from '../study/engine';
import { MOODS, type JournalEntry } from './store';

const SYSTEM = `You read a person's private journal pages from the last week and write a short, kind summary in 3 to 5 plain sentences: what went well, what was hard, and one small suggestion. Use only what the pages say. Do not invent events, do not diagnose, and do not give medical advice.`;

const label = (mood: number | null): string => MOODS.find((m) => m.value === mood)?.label ?? 'not said';

/** The pages of the last seven days (newest day last) as the text the AI reads. Pure. */
function weekText(entries: JournalEntry[], today: string): string {
  const from = new Date(Date.parse(`${today}T12:00:00`) - 6 * 86_400_000);
  const first = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
  return entries.filter((e) => e.day >= first && e.day <= today && e.text).sort((a, b) => a.day.localeCompare(b.day))
    .map((e) => `${e.day} (mood: ${label(e.mood)}): ${e.text.slice(0, 600)}`).join('\n');
}

/** The summary, or null when there is nothing written in the last week. */
export async function summarizeWeek(entries: JournalEntry[], today: string): Promise<string | null> {
  const text = weekText(entries, today);
  if (!text) return null;
  return (await askShaped(SYSTEM, `Pages:\n${text}\n\nSummary:`, { label: 'Summarizing the journal week', maxTokens: 260 })).trim() || null;
}
