/**
 * Questions that are already in the learner's textbooks (end-of-chapter questions, review questions, practice problems, with
 * the book's answer key when it is printed next to them). Lessons, quizzes and practice use these first, in the book's own words
 * and numbers, and ask the AI to write new ones only to fill what the book does not have. Pure parts are tested without a device.
 */
export interface BookQuestion { question: string; answer?: string; source: string; /** The number the bank gave it ("12."), used to find its answer in a key at the end. */ number?: number }

const START = /^\s*(?:\(?\d{1,3}[.)]|Q\s*\d{0,3}[.:)]|Question\s*\d{0,3}[.:]|Problem\s*[\d.-]+[.:]|Exercise\s*[\d.-]+[.:]|Review question\s*\d*[.:])\s+/i;
const OPTION = /^\s*\(?[A-Ea-e][.)]\s+\S/;
const ANSWER = /^\s*(?:correct\s+)?(?:answer|ans|solution)\s*[:.-]\s*(.+)$/i;
const NUMBERED = /^\s*\(?(\d{1,3})[.)]\s+/;

/** `{ number }` when a line starts with its question number, else nothing. */
const numberOf = (line: string): { number?: number } => {
  const n = Number(NUMBERED.exec(line)?.[1]);
  return Number.isInteger(n) && n > 0 ? { number: n } : {};
};

/** A chunk from a PDF read by page starts with its page, "(p. 12) ": that goes from the text into the source. */
function withoutPage(text: string, source: string): { text: string; source: string } {
  const page = /^\(p\. (\d+)\)\s*/.exec(text);
  return page ? { text: text.slice(page[0].length), source: `${source} p. ${page[1]}` } : { text, source };
}

/** Question-shaped passages in one text: numbered or labelled starters, and sentences that end in a question mark, with options and a printed answer. */
export function extractQuestions(rawText: string, rawSource: string): BookQuestion[] {
  const { text, source } = withoutPage(rawText, rawSource);
  const out: BookQuestion[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const starts = START.test(line);
    if (!starts && !/\?\s*$/.test(line)) continue;
    let question = line.replace(START, '').trim();
    let answer: string | undefined;
    for (let j = i + 1; j < lines.length && j <= i + 7; j++) {
      const next = lines[j].trim();
      const a = ANSWER.exec(next);
      if (a) { answer = a[1].trim().slice(0, 300); i = j; break; }
      if (OPTION.test(next) || (!START.test(next) && next && !/^[A-Z][A-Za-z ]{0,40}$/.test(next) && question.length < 400 && !/[.!]\s*$/.test(question))) question += ` ${next}`;
      else if (START.test(next)) break;
    }
    question = question.replace(/\s+/g, ' ').trim();
    if (question.length < 25 || question.length > 700 || !(/\?/.test(question) || OPTION.test(` ${question}`) || starts)) continue;
    out.push({ question, answer, source, ...numberOf(line) });
  }
  return out;
}

// ---------------------------------------------------------------- question banks
const KEY_HEAD = /^\s*(?:answer\s*key|answers|answer\s*sheet|solutions?)\b/i;
const KEY_ENTRY = /(?:^|[\s,;])(\d{1,3})\s*[.):\-–]?\s*\(?([A-Ea-e])\)?(?=[\s,;.]|$)/g;

/** The answer key printed at the end of a bank ("Answer key: 1-B 2-D 3. A"): question number to letter. Empty when there is no key. */
export function parseAnswerKey(text: string): Map<number, string> {
  const lines = text.replace(/\r/g, '').split('\n');
  let from = -1;
  lines.forEach((l, i) => { if (KEY_HEAD.test(l)) from = i; });
  const key = new Map<number, string>();
  if (from < 0) return key;
  for (const line of lines.slice(from)) {
    for (const m of line.matchAll(KEY_ENTRY)) { const n = Number(m[1]); if (!key.has(n)) key.set(n, m[2].toUpperCase()); }
  }
  return key.size >= 5 ? key : new Map();
}

/** The text of option `letter` inside a question that lists its options ("A) 5 B) 7 C) 9"), or the letter when the options are not there. */
function optionText(question: string, letter: string): string {
  const parts = [...question.matchAll(/(?:^|\s)\(?([A-Ea-e])[.)]\s+(.+?)(?=\s+\(?[A-Ea-e][.)]\s|$)/g)];
  const hit = parts.find((m) => m[1].toUpperCase() === letter);
  return hit ? hit[2].trim().slice(0, 200) : letter;
}

/** Fills in answers from a key, for questions that carry their number and no answer of their own. A number used twice (chapters that restart at 1) is left alone. */
export function applyAnswerKey(bank: BookQuestion[], key: Map<number, string>): BookQuestion[] {
  if (!key.size) return bank;
  const used = new Map<number, number>();
  for (const q of bank) if (q.number) used.set(q.number, (used.get(q.number) ?? 0) + 1);
  return bank.map((q) => {
    const letter = q.number && used.get(q.number) === 1 ? key.get(q.number) : undefined;
    return !q.answer && letter ? { ...q, answer: optionText(q.question, letter) } : q;
  });
}

const lineKind = (line: string): 'question' | 'option' | 'other' => {
  if (OPTION.test(line)) return 'option';
  return START.test(line) || /\?\s*$/.test(line) ? 'question' : 'other';
};

/** True when most of a text is questions: a question bank, not a textbook that happens to end each chapter with a few. */
export function isQuestionBankText(text: string, minimum = 10, share = 0.25): boolean {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter((l) => l.length > 2);
  const kinds = lines.map(lineKind);
  const questions = kinds.filter((k) => k === 'question').length;
  const content = kinds.filter((k) => k !== 'option').length;
  return questions >= minimum && content > 0 && questions / content >= share;
}

/** True when one passage is mostly questions, so it is not read as teaching material. */
export const looksLikeQuestions = (chunk: string): boolean => isQuestionBankText(chunk, 3, 0.4);

const STOP = new Set(['and', 'the', 'for', 'with', 'of', 'to', 'in', 'on', 'a', 'an', 'basics', 'other', 'select', 'what', 'which', 'how', 'that', 'this', 'from']);
const stems = (t: string) => [...new Set((t.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !STOP.has(w)).map((w) => w.slice(0, 5)))];

/** The questions on a topic: the ones that mention at least two of its key words (one, for a one-word topic), those with a printed answer first. */
export function questionsOn(bank: BookQuestion[], topic: string, limit = 6): BookQuestion[] {
  const want = stems(topic);
  if (!want.length) return [];
  const need = Math.min(2, want.length);
  const seen = new Set<string>();
  return bank.filter((q) => {
    const have = new Set(stems(q.question));
    const key = q.question.slice(0, 80).toLowerCase();
    if (seen.has(key) || want.filter((w) => have.has(w)).length < need) return false;
    seen.add(key); return true;
  }).sort((a, b) => Number(!!b.answer) - Number(!!a.answer)).slice(0, limit);
}

const cache = new Map<string, { stamp: string; bank: BookQuestion[] }>();

/** Every question found in a project's documents (read once per set of documents, then kept). */
export async function projectQuestionBank(projectId: string | undefined): Promise<BookQuestion[]> {
  if (!projectId) return [];
  try {
    const { ragService } = require('../services/rag');
    const docs: Array<{ id: number; name: string; size?: number }> = await ragService.getDocumentsByProject(projectId);
    const stamp = docs.map((d) => `${d.id}:${d.size ?? ''}`).join(',');
    const kept = cache.get(projectId);
    if (kept && kept.stamp === stamp) return kept.bank;
    const bank: BookQuestion[] = [];
    for (const doc of docs) {
      const chunks: Array<{ content: string }> = await ragService.getDocumentChunks(doc.id);
      // Chunks overlap, so questions are found per chunk and repeats are dropped by their opening words.
      const seen = new Set<string>();
      const found: BookQuestion[] = [];
      let key = new Map<number, string>();
      for (const c of chunks) {
        for (const q of extractQuestions(String(c.content), doc.name)) {
          const dedupe = q.question.slice(0, 60).toLowerCase();
          if (!seen.has(dedupe)) { seen.add(dedupe); found.push(q); }
        }
        const here = parseAnswerKey(String(c.content));
        if (here.size > key.size) key = here;
      }
      bank.push(...applyAnswerKey(found, key));
    }
    cache.set(projectId, { stamp, bank });
    return bank;
  } catch { return []; }
}

/** The text that tells the AI to use the textbook's own questions first (empty when there are none). */
export function bookQuestionsPrompt(found: BookQuestion[]): string {
  if (!found.length) return '';
  return `QUESTIONS FROM THE LEARNER'S OWN TEXTBOOK on this topic. Use these first, in the book's own words and numbers, and say they are from the textbook; write new questions only to fill what these do not cover. Where the book printed an answer, that is the correct answer. Where it did not, work the answer out carefully.\n${
    found.map((q, i) => `${i + 1}. [${q.source}] ${q.question}${q.answer ? ` (book's answer: ${q.answer})` : ''}`).join('\n')}\n`;
}
