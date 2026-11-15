/**
 * Exact lookups. A question that names a section ("§ 179", "section 1245", "Reg. 1.263(a)-1", "ASC 842-10-25", "ASU 2016-02", "Rev. Proc. 2024-40",
 * "Notice 2024-5") is best answered from the text that carries that exact reference; the meaning-based search finds such text poorly, because
 * "section 179" and "section 197" mean almost the same to it. Pure: it turns a question into the strings to look for.
 */
export interface Ref { kind: 'section' | 'regulation' | 'asc' | 'asu' | 'ruling' | 'notice'; id: string; needles: string[] }

const SECTION = /(?:§+|\b(?:sec(?:tion)?s?\.?|irc)\s*)\s*(\d{1,4}[A-Za-z]?)(\([a-z0-9]+\))?/gi;
const REG = /\b(?:treas(?:ury)?\.?\s*reg(?:ulation)?s?\.?|reg(?:ulation)?s?\.?|26\s*cfr)\s*§?\s*(\d{1,3}\.\d{1,5}(?:[A-Za-z0-9()-]*))/gi;
const ASC = /\basc\s*(\d{3}(?:-\d{2}(?:-\d{2}(?:-\d{1,3})?)?)?)/gi;
const ASU = /\basu\s*(\d{4}-\d{2})/gi;
const RULING = /\brev(?:enue)?\.?\s*(rul|proc)(?:ing|edure)?s?\.?\s*(\d{2,4}-\d{1,3})/gi;
const NOTICE = /\bnotice\s*(\d{4}-\d{1,3})/gi;

/** The exact references a question names. A section number alone ("179") is not one; it needs "§", "section" or "IRC" before it. */
export function sectionRefs(query: string): Ref[] {
  const out: Ref[] = [];
  const add = (r: Ref) => { if (!out.some((o) => o.kind === r.kind && o.id === r.id)) out.push(r); };
  for (const m of query.matchAll(REG)) add({ kind: 'regulation', id: m[1], needles: [`§ ${m[1]}`, `§${m[1]}`, `Reg. ${m[1]}`, `${m[1]}`] });
  for (const m of query.matchAll(SECTION)) {
    const n = `${m[1]}${m[2] ?? ''}`;
    if (!/^\d/.test(m[1]) || out.some((o) => o.kind === 'regulation' && o.id.startsWith(m[1]))) continue;
    add({ kind: 'section', id: n, needles: [`§ ${n}`, `§${n}`, `Sec. ${n}`, `Section ${n}`, `SEC. ${m[1]}.`] });
  }
  for (const m of query.matchAll(ASC)) add({ kind: 'asc', id: m[1], needles: [`ASC ${m[1]}`, `Topic ${m[1].slice(0, 3)}`, m[1]] });
  for (const m of query.matchAll(ASU)) add({ kind: 'asu', id: m[1], needles: [`ASU ${m[1]}`, `Update No. ${m[1]}`, `Update ${m[1]}`, m[1]] });
  for (const m of query.matchAll(RULING)) add({ kind: 'ruling', id: `${m[1].toLowerCase()} ${m[2]}`, needles: [`Rev. ${m[1].toLowerCase().startsWith('r') && /proc/i.test(m[1]) ? 'Proc.' : 'Rul.'} ${m[2]}`, `Rev. Rul. ${m[2]}`, `Rev. Proc. ${m[2]}`].filter((x, i, a) => a.indexOf(x) === i) });
  for (const m of query.matchAll(NOTICE)) add({ kind: 'notice', id: m[1], needles: [`Notice ${m[1]}`] });
  return out;
}

/** How well a chunk's start matches a reference: a heading that opens with it beats a passing mention. Higher is better; 0 means no match. */
export function refScore(content: string, refs: Ref[]): number {
  let best = 0;
  const head = content.slice(0, 80).toLowerCase();
  for (const r of refs) {
    for (const n of r.needles) {
      const needle = n.toLowerCase();
      const at = content.toLowerCase().indexOf(needle);
      if (at < 0) continue;
      best = Math.max(best, head.includes(needle) ? 3 : at < 400 ? 2 : 1);
    }
  }
  return best;
}
