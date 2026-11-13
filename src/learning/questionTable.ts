/**
 * A question bank saved as a table (CSV or tab-separated, as exported from a spreadsheet or a question-bank site) is read in code,
 * with no AI and no size limit: a header row names the columns (question, answer, and optionally choices, explanation and topic).
 * Pure, so it is tested without a device.
 */
import type { NormalizedQuestion } from './questionImport';

/** One line split on the delimiter, honouring "quoted, cells" and doubled quotes. */
function cells(line: string, delimiter: string): string[] {
  const out: string[] = []; let cur = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false; } else cur += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === delimiter) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Rows of a CSV, where a quoted cell may hold line breaks. */
function rows(text: string, delimiter: string): string[][] {
  const lines: string[] = []; let cur = ''; let quoted = false;
  for (const ch of text.replace(/\r\n?/g, '\n')) {
    if (ch === '"') quoted = !quoted;
    if (ch === '\n' && !quoted) { lines.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) lines.push(cur);
  return lines.filter((l) => l.trim()).map((l) => cells(l, delimiter));
}

const find = (header: string[], ...names: RegExp[]): number => header.findIndex((h) => names.some((n) => n.test(h)));

/** The questions in a table, or null when the text is not a table with a question column and an answer column. */
export function parseQuestionTable(text: string): NormalizedQuestion[] | null {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = first.includes('\t') ? '\t' : first.includes(';') && !first.includes(',') ? ';' : ',';
  const all = rows(text, delimiter);
  if (all.length < 2) return null;
  const header = all[0].map((h) => h.toLowerCase());
  const q = find(header, /^(question|prompt|stem|front)$/);
  const a = find(header, /^(answer|correct( answer)?|key|back)$/);
  if (q < 0 || a < 0) return null;
  const topic = find(header, /^(topic|subject|section|chapter|category|area)$/);
  const why = find(header, /^(explanation|explain|rationale|why|reason)$/);
  const choiceCols = header.map((h, i) => (/^(option|choice)\s*[a-e1-5]$|^[a-e]$/.test(h) ? i : -1)).filter((i) => i >= 0);
  const combined = find(header, /^(options|choices)$/);
  const out: NormalizedQuestion[] = [];
  for (const row of all.slice(1)) {
    const question = row[q]?.trim(); let answer = row[a]?.trim();
    if (!question || !answer) continue;
    let options = choiceCols.map((i) => row[i]?.trim()).filter(Boolean) as string[];
    if (!options.length && combined >= 0 && row[combined]) options = row[combined].split(/\s*(?:\||;|\n)\s*/).map((o) => o.trim()).filter(Boolean);
    // An answer that is a letter (A to E) or a number (1 to 5) names a choice.
    if (options.length >= 2) {
      const letter = /^([A-Ea-e])[.)]?$/.exec(answer); const number = /^([1-5])$/.exec(answer);
      const index = letter ? letter[1].toLowerCase().charCodeAt(0) - 97 : number ? Number(number[1]) - 1 : -1;
      if (index >= 0 && index < options.length) answer = options[index];
    }
    out.push({ question, answer, alternatives: [], ...(options.length >= 2 ? { options } : {}),
      ...(topic >= 0 && row[topic] ? { topic: row[topic].trim() } : {}), ...(why >= 0 && row[why] ? { explain: row[why].trim() } : {}) });
  }
  return out.length ? out : null;
}
