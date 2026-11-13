/**
 * Questions that are already in the learner's textbooks (end-of-chapter questions, review questions, practice problems, with
 * the book's answer key when it is printed next to them). Lessons, quizzes and practice use these first, in the book's own words
 * and numbers, and ask the AI to write new ones only to fill what the book does not have. Pure parts are tested without a device.
 */
export interface BookQuestion { question: string; answer?: string; source: string }

const START = /^\s*(?:\(?\d{1,3}[.)]|Q\s*\d{0,3}[.:)]|Question\s*\d{0,3}[.:]|Problem\s*[\d.-]+[.:]|Exercise\s*[\d.-]+[.:]|Review question\s*\d*[.:])\s+/i;
const OPTION = /^\s*\(?[A-Ea-e][.)]\s+\S/;
const ANSWER = /^\s*(?:correct\s+)?(?:answer|ans|solution)\s*[:.-]\s*(.+)$/i;

/** Question-shaped passages in one text: numbered or labelled starters, and sentences that end in a question mark, with options and a printed answer. */
export function extractQuestions(rawText: string, rawSource: string): BookQuestion[] {
  // A chunk from a PDF read by page starts with its page, "(p. 12) ": drop it from the text and keep it in the source.
  const page = /^\(p\. (\d+)\)\s*/.exec(rawText);
  const text = page ? rawText.slice(page[0].length) : rawText;
  const source = page ? `${rawSource} p. ${page[1]}` : rawSource;
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
    out.push({ question, answer, source });
  }
  return out;
}

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
      for (const c of chunks) {
        for (const q of extractQuestions(String(c.content), doc.name)) {
          const key = q.question.slice(0, 60).toLowerCase();
          if (!seen.has(key)) { seen.add(key); bank.push(q); }
        }
      }
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
