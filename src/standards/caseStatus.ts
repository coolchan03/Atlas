/**
 * Whether a court case is still good law, checked with the web search. The search is run for later treatment (overruled, reversed, vacated,
 * superseded by statute, followed, affirmed) and each result is shown with the signals found in its text, found here in code, so the model
 * works from what the pages say. A negative word can describe the case's own appeal (the appeals court reversed the Tax Court in this very
 * case) rather than what later courts did, so the model is told to open a page and read who did what, and when, before calling a case bad law.
 */
export type Search = (query: string) => Promise<Array<{ title: string; url?: string; snippet?: string }>>;

const NEGATIVE = /\b(overrul(?:ed|ing)|revers(?:ed|al)|vacat(?:ed|ur)|abrogat(?:ed|ion)|superseded|disapproved|no longer (?:good|binding)|struck down|invalidated)\b/i;
const POSITIVE = /\b(affirm(?:ed|ing)|followed|upheld|reaffirm(?:ed))\b/i;
const NEUTRAL = /\b(distinguished|criticized|questioned|limited|narrowed)\b/i;

/** The treatment words in a result's text. Pure. */
function signalsIn(text: string): string[] {
  const out: string[] = [];
  for (const [label, re] of [['negative', NEGATIVE], ['positive', POSITIVE], ['mixed', NEUTRAL]] as const) { const m = re.exec(text); if (m) out.push(`${label} (${m[0].toLowerCase()})`); }
  return out;
}

interface TreatmentHit { title: string; url: string; snippet: string; signals: string[]; negative: boolean }
export interface Treatment { name: string; hits: TreatmentHit[]; negative: number }

/** Later-treatment search results for a case, each with the signals found in its text. Throws when every search failed (offline). */
export async function caseTreatment(caseName: string, search: Search): Promise<Treatment> {
  const name = caseName.replace(/\s+/g, ' ').trim().slice(0, 160);
  if (!name) throw new Error('Missing required parameter: case');
  const queries = [`"${name}" overruled OR reversed OR vacated OR abrogated OR superseded`, `"${name}" later treatment followed OR distinguished OR cited by`, `"${name}" superseded by statute OR legislation OR amended`];
  const seen = new Map<string, { title: string; url: string; snippet: string }>();
  let failures = 0;
  for (const q of queries) {
    try { for (const h of await search(q)) if (h.url && !seen.has(h.url)) seen.set(h.url, { title: h.title, url: h.url, snippet: (h.snippet ?? '').replace(/\s+/g, ' ').slice(0, 280) }); }
    catch { failures += 1; }
  }
  if (failures === queries.length) throw new Error('The search could not be reached (offline or blocked), so the case could not be checked.');
  const hits = [...seen.values()].slice(0, 8).map((h) => ({ ...h, signals: signalsIn(`${h.title} ${h.snippet}`), negative: NEGATIVE.test(`${h.title} ${h.snippet}`) }));
  return { name, hits, negative: hits.filter((h) => h.negative).length };
}

/** Search results about a case's later treatment, as text for the model, with the signals found in each. Throws when every search failed (offline). */
export async function caseStatus(caseName: string, search: Search): Promise<string> {
  const { name, hits, negative } = await caseTreatment(caseName, search);
  if (!hits.length) return `The search for later treatment of "${name}" returned nothing. Report that the search found no later treatment, and which searches were run: overruled/reversed/vacated, followed/distinguished, superseded by statute.`;
  const lines = hits.map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}\n   ${h.snippet}\n   Signals: ${h.signals.length ? h.signals.join(', ') : 'none in this text'}`);
  return `Later treatment of "${name}": ${hits.length} results, ${negative} with negative words.\n\n${lines.join('\n\n')}\n\nA negative word may describe the case's own appeal, not later treatment: open the page with read_url and see which court did what, and when, before saying the case is no longer good law. Say what you found and from which pages.`;
}
