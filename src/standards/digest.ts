/**
 * "What changed since my book": looks on the standard-setters' own sites (FASB, the IRS, the SEC, the AICPA, the PCAOB) for pages dated after the
 * newest book in the folder, on the topics that tend to change. It only lists what those sites show, with a link: it never says what a change
 * "probably" is. Offline is reported as offline, not as "nothing changed". Pure apart from the search it is given.
 */
import { asuNumbers, hostOf } from './authority';
import { officialPages, type Search } from './lookup';

export interface DigestItem { title: string; url: string; host: string; snippet: string; year: number; topic: string }
export interface Digest { items: DigestItem[]; searched: number; failed: number; offline: boolean }

/** The year a page is about: the newest year in its title, snippet or address, or the year of an ASU number ("2023-01"). 0 when it shows none. */
export function yearOfPage(text: string): number {
  const years = [...text.matchAll(/(?<!\d)(20\d{2})(?!\d)/g)].map((m) => Number(m[1]));
  return years.length ? Math.max(...years) : 0;
}

/** The newest year shown in the names of the documents (a book called "Intermediate Accounting 2022"), or null when none shows one. */
export function newestBookYear(names: string[]): number | null {
  const years = names.map((n) => yearOfPage(n)).filter(Boolean);
  return years.length ? Math.max(...years) : null;
}

const FASB_TOPICS = ['leases', 'revenue', 'credit losses', 'segment reporting', 'income taxes', 'crypto', 'derivatives', 'business combinations', 'goodwill', 'debt'];

/** The topics worth checking for an exam: for accounting the ones the standard-setter keeps changing, for tax the IRS's notices and procedures, else the first few topics. */
export function digestTopics(code: string, topics: string[]): string[] {
  const lower = topics.map((t) => t.toLowerCase());
  if (code === 'FAR' || code === 'AUD') {
    const changing = FASB_TOPICS.filter((k) => lower.some((t) => t.includes(k)));
    return ['Accounting Standards Update', ...changing].slice(0, 6);
  }
  if (code === 'REG' || code === 'TCP' || code === 'EA') return ['IRS Notice', 'IRS Revenue Procedure', 'tax law changes inflation adjustments'];
  return topics.slice(0, 4);
}

export async function updatesSince(opts: { topics: string[]; bookYear: number; search: Search; limit?: number }): Promise<Digest> {
  const { topics, bookYear, search, limit = 12 } = opts;
  const found = new Map<string, DigestItem>();
  let failed = 0;
  for (const topic of topics) {
    try {
      for (const p of await officialPages(`${topic} ${bookYear + 1}`, search)) {
        if (!p.url) continue;
        const year = Math.max(yearOfPage(`${p.title} ${p.snippet ?? ''} ${p.url}`), ...asuNumbers(`${p.title} ${p.snippet ?? ''}`).map((a) => Number(a.slice(0, 4))));
        if (year > bookYear && !found.has(p.url)) found.set(p.url, { title: p.title, url: p.url, host: hostOf(p.url), snippet: (p.snippet ?? '').slice(0, 240), year, topic });
      }
    } catch { failed += 1; }
  }
  const items = [...found.values()].sort((a, b) => b.year - a.year).slice(0, limit);
  return { items, searched: topics.length, failed, offline: topics.length > 0 && failed === topics.length };
}
