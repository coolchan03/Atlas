/**
 * The look back that comes with an opened time capsule: what the journal says about the time since the letter was sealed.
 * The counts and moods are worked out here in code and shown as facts; the AI only writes the few sentences about what the pages say.
 */
import { askShaped } from '../study/engine';
import { MOODS, type JournalEntry } from '../journal/store';

const SYSTEM = `You read some of a person's private journal pages from the time since they sealed a letter to their future self. Write 3 to 5 plain, kind sentences about how that time went: what stayed the same, what changed and what stands out. Use only what the pages say. Do not invent events, do not diagnose, and do not give advice.`;
const MAX_PAGES = 12;

interface PeriodFacts { pages: number; averageMood: number | null; best: JournalEntry | null; hardest: JournalEntry | null }

const dayOf = (t: number) => new Date(t);
const key = (t: number) => `${dayOf(t).getFullYear()}-${String(dayOf(t).getMonth() + 1).padStart(2, '0')}-${String(dayOf(t).getDate()).padStart(2, '0')}`;

/** The written pages from the day of `from` up to the day of `to`, oldest first. Pure. */
function pagesBetween(entries: JournalEntry[], from: number, to: number): JournalEntry[] {
  return entries.filter((e) => e.text.trim() && e.day >= key(from) && e.day <= key(to)).sort((a, b) => a.day.localeCompare(b.day));
}

/** Counts and moods, in code. Pure. */
function periodFacts(pages: JournalEntry[]): PeriodFacts {
  const moods = pages.filter((p) => p.mood !== null);
  const average = moods.length ? moods.reduce((a, p) => a + (p.mood as number), 0) / moods.length : null;
  const sorted = [...moods].sort((a, b) => (b.mood as number) - (a.mood as number) || a.day.localeCompare(b.day));
  return { pages: pages.length, averageMood: average === null ? null : Math.round(average * 10) / 10, best: sorted[0] ?? null, hardest: sorted[sorted.length - 1] ?? null };
}

/** At most MAX_PAGES pages spread evenly over the period, so a year fits one small prompt. Pure. */
function samplePages(pages: JournalEntry[]): JournalEntry[] {
  if (pages.length <= MAX_PAGES) return pages;
  return Array.from({ length: MAX_PAGES }, (_, i) => pages[Math.round((i * (pages.length - 1)) / (MAX_PAGES - 1))]);
}

/** The facts as sentences, written in code. */
function factsLine(f: PeriodFacts): string {
  if (!f.pages) return 'You wrote no journal pages in this time.';
  const mood = f.averageMood === null ? '' : ` Your mood averaged ${f.averageMood} out of 5.`;
  const best = f.best && f.best.mood !== f.hardest?.mood ? ` The best day was ${f.best.day} (${MOODS.find((m) => m.value === f.best!.mood)?.label}); the hardest was ${f.hardest!.day} (${MOODS.find((m) => m.value === f.hardest!.mood)?.label}).` : '';
  return `You wrote ${f.pages} journal page${f.pages === 1 ? '' : 's'}.${mood}${best}`;
}

/** The look back: the facts, then the AI's sentences when there are pages to read. */
export async function lookBack(entries: JournalEntry[], from: number, to: number): Promise<string> {
  const pages = pagesBetween(entries, from, to);
  const facts = factsLine(periodFacts(pages));
  if (!pages.length) return facts;
  const text = samplePages(pages).map((p) => `${p.day}: ${p.text.slice(0, 350)}`).join('\n');
  const words = (await askShaped(SYSTEM, `Pages:\n${text}\n\nSummary:`, { label: 'Looking back on the journal', maxTokens: 260 })).trim();
  return words ? `${facts}\n\n${words}` : facts;
}
