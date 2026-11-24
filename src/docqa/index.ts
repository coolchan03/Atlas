/**
 * Questions about one long document, without making a project of it. The document is cut into passages and each is read by the small
 * embedding model the app already carries for document search; a question is matched to the passages that are closest in meaning and the
 * answer is written from those few passages alone, with their numbers. A question that needs the whole document ("summarise it", "list
 * everything that...") cannot be answered from a few passages, so the document is read in parts first (longText.ts) and the answer is
 * written from those notes. Nothing is saved: the document and its index live only while the screen is open.
 */
import { embeddingService } from '../services/rag/embedding';
import { cosineSimilarity } from '../services/rag/vectorMath';
import { askShaped } from '../study/engine';
import { digestText, splitIntoParts } from '../workflows/longText';
import { currentStepBudget } from '../workflows/stepPrompt';

/** Characters per passage: one idea or two, small enough to quote and to fit several into a small model's prompt. */
const PASSAGE_CHARS = 700;
/** The most passages a document is cut into (about 140 pages); beyond it the Knowledge base is the tool. */
const MAX_PASSAGES = 400;
const SHOWN = 4;
const MIN_SIMILARITY = 0.2;
const ANSWER_TOKENS = 400;

export interface DocIndex { passages: string[]; vectors: Array<number[] | null> }

/** Cuts the text into passages; throws a plain sentence when it is longer than the limit. */
function passagesOf(text: string): string[] {
  const passages = splitIntoParts(text, PASSAGE_CHARS);
  if (passages.length > MAX_PASSAGES) throw new Error(`This document is too long to search here (${passages.length} passages, the limit is ${MAX_PASSAGES}). Put it in a Knowledge base project instead.`);
  return passages;
}

/** Reads every passage with the embedding model. `onProgress` hears how many are done. A passage the model cannot read is left without a vector (it is found by its words instead). A passage already in `known` is not read again. */
export async function indexPassages(passages: string[], onProgress: (done: number, total: number) => void = () => undefined, known?: Map<string, number[] | null>): Promise<DocIndex> {
  const vectors: Array<number[] | null> = [];
  try {
    await embeddingService.load();
    for (let i = 0; i < passages.length; i += 1) {
      const have = known?.get(passages[i]);
      const vector = have !== undefined ? have : await embeddingService.embed(passages[i]).catch(() => null);
      known?.set(passages[i], vector);
      vectors.push(vector);
      onProgress(i + 1, passages.length);
    }
  } catch { while (vectors.length < passages.length) vectors.push(null); }
  return { passages, vectors };
}

/** Reads a document: cut into passages, each read by the embedding model. */
export const buildIndex = (text: string, onProgress?: (done: number, total: number) => void): Promise<DocIndex> => indexPassages(passagesOf(text), onProgress);

const words = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

/** The passage numbers (0-based) closest to the question, best first: by meaning when the passages have vectors, by shared words otherwise. */
async function closestPassages(question: string, index: DocIndex, count = SHOWN): Promise<number[]> {
  let query: number[] | null = null;
  if (index.vectors.some(Boolean)) { try { query = await embeddingService.embed(question); } catch { query = null; } }
  const asked = new Set(words(question));
  const scored = index.passages.map((text, i) => {
    const v = index.vectors[i];
    const byWords = words(text).filter((w) => asked.has(w)).length / Math.max(4, asked.size);
    return { i, score: query && v ? cosineSimilarity(query, v) : byWords };
  });
  const floor = query ? MIN_SIMILARITY : 0.05;
  const best = scored.filter((s) => s.score >= floor).sort((a, b) => b.score - a.score).slice(0, count);
  return best.map((s) => s.i);
}

/** True for a question that needs the whole document rather than a few passages. */
const needsWholeDocument = (question: string): boolean =>
  /\b(summari[sz]e|summary|overview|main (points?|ideas?|themes?)|key (points?|takeaways?)|what is (this|the document|it) about|tl;?dr|outline|every|all the|list all)\b/i.test(question);

export interface Answer { text: string; /** 1-based numbers of the passages the answer came from, in document order (empty for a whole-document answer). */ from: number[]; whole: boolean }

const SYSTEM = `You answer a question using only the numbered passages from a document. After each fact put the number of its passage in brackets, like [2]. If the passages do not contain the answer, say so plainly and do not guess.`;
const WHOLE_SYSTEM = `You answer a question about a document using only the notes taken from every part of it. Keep names, numbers and dates exactly as in the notes. If the notes do not contain the answer, say so plainly and do not guess.`;

/** Answers a question about the document. Throws a plain sentence when the AI cannot answer. */
export async function answerQuestion(question: string, doc: { text: string; index: DocIndex }): Promise<Answer> {
  const q = question.trim().slice(0, 400);
  if (needsWholeDocument(q)) {
    const notes = await digestText(q, doc.text, { budget: currentStepBudget(), ask: (system, user, label) => askShaped(system, user, { label, maxTokens: 350 }) });
    const text = (await askShaped(WHOLE_SYSTEM, `Notes from the whole document:\n${notes}\n\nQuestion: ${q}\nAnswer:`, { label: 'Answering from the whole document', maxTokens: ANSWER_TOKENS })).trim();
    return { text, from: [], whole: true };
  }
  return answerFromPassages(q, doc.index, { none: 'I could not find anything about that in the document.', task: 'Answering from the document' });
}

/**
 * Answers from the few passages closest in meaning to the question, citing their numbers. `labelOf` names where a passage came from
 * (a journal day, a chat), and is shown to the AI and returned so the screen can say it.
 */
export async function answerFromPassages(question: string, index: DocIndex, opts: { labelOf?: (i: number) => string; none?: string; task?: string } = {}): Promise<Answer> {
  const { labelOf = () => '', none = 'I could not find anything about that.', task = 'Answering from the passages' } = opts;
  const q = question.trim().slice(0, 400);
  const near = (await closestPassages(q, index)).sort((a, b) => a - b);
  if (!near.length) return { text: none, from: [], whole: false };
  const room = Math.round(currentStepBudget() * 0.7);
  const used: number[] = []; let block = '';
  for (const i of near) {
    const label = labelOf(i);
    const piece = `[${i + 1}]${label ? ` (${label})` : ''} ${index.passages[i]}\n\n`;
    if (block.length + piece.length > room && used.length) break;
    block += piece; used.push(i + 1);
  }
  const text = (await askShaped(SYSTEM, `Passages:\n${block}Question: ${q}\nAnswer:`, { label: task, maxTokens: ANSWER_TOKENS })).trim();
  return { text, from: used, whole: false };
}
