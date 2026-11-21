import { asuNumbers, isOfficialUrl } from './authority';

/**
 * Looks up what the standard-setter itself has published on a topic, so a textbook that predates a change can be corrected. It searches
 * the setter's own sites only (FASB for accounting, and the SEC, IRS, AICPA and PCAOB for the others), keeps only pages that really are
 * on those sites, and puts the newest Accounting Standards Update first. It never says what a standard "probably" says: when nothing
 * official is found, it says so, and the answer must then be marked as not checked.
 */
export interface Hit { title: string; url?: string; snippet?: string }
export type Search = (query: string) => Promise<Hit[]>;

const SITES = ['fasb.org', 'asc.fasb.org', 'sec.gov', 'irs.gov', 'aicpa-cima.com', 'pcaobus.org'];

/** Official pages for a topic, newest update first. Throws when every search failed (offline or blocked), so that is not mistaken for "nothing changed". */
export async function officialPages(topic: string, search: Search): Promise<Hit[]> {
  const query = topic.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!query) throw new Error('Missing required parameter: topic');
  const queries = [`${query} Accounting Standards Update ASU site:fasb.org`, `${query} FASB codification site:asc.fasb.org`, ...SITES.slice(2, 4).map((s) => `${query} site:${s}`)];
  const seen = new Map<string, Hit>();
  let failures = 0;
  for (const q of queries) {
    try {
      for (const h of await search(q)) if (h.url && isOfficialUrl(h.url) && !seen.has(h.url)) seen.set(h.url, h);
    } catch { failures += 1; }
  }
  if (failures === queries.length) throw new Error('The search could not be reached (offline or blocked), so the latest standards could not be checked.');
  const newest = (h: Hit) => asuNumbers(`${h.title} ${h.snippet ?? ''} ${h.url ?? ''}`)[0] ?? '';
  return [...seen.values()].sort((a, b) => (newest(a) < newest(b) ? 1 : -1)).slice(0, 8);
}

/** What the standards_check tool returns to the model. */
export async function standardsCheck(topic: string, search: Search): Promise<string> {
  const pages = await officialPages(topic, search);
  if (!pages.length) {
    return `No page from the standard-setters (FASB, SEC, IRS, AICPA, PCAOB) was found for "${topic}". So the textbook could not be checked against the latest standard: say it is not checked, and do not claim that it is out of date or up to date.`;
  }
  const lines = pages.map((p, i) => {
    const asu = asuNumbers(`${p.title} ${p.snippet ?? ''}`)[0];
    return `${i + 1}. ${p.title}${asu ? ` (ASU ${asu})` : ''}\n   ${p.url}\n   ${(p.snippet ?? '').slice(0, 300)}`;
  });
  return `Pages from the standard-setters themselves about "${topic}", newest first:\n\n${lines.join('\n\n')}\n\nThe standard overrules a textbook that predates it. If a page above is newer than the textbook and says something different, say: what the textbook says, what the standard says, the ASU number and its effective date, and quote the passage. If the snippet does not show the change, open the page with read_url before saying anything. Never give an ASU number or date that is not on one of these pages.`;
}
