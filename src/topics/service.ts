/**
 * Makes courses and their squares with the AI on the phone. Everything the AI writes is checked by formats.ts; a bad answer is
 * asked for once more before giving up with a message the person can act on.
 */
import { askModel } from '../study/engine';
import { callLimitMs } from './timeLimit';
import { beginWork, currentWork, endWork, giveUpReason, noteReading, noteWriting } from './liveWork';
import logger from '../utils/logger';
import { drillFor, makeDrillSet } from '../study/drills';
import { makePeriodicQuestions } from '../study/periodicQuiz';
import { contentMessages, deepenMessages, prose, gradeMessages, parseContent, parseGrade, parsePlan, planMessages, type CourseRequest, type SquareContent } from './formats';
import { useTopics, type Course } from './store';
import { bookByBookPlan, chapterPlan, findChapters, parseSubjects, shortSubject, subjectPrompt, type Chapter } from './chapters';
import { asChapters, bookChapters, mergeBooks } from './multiBook';
import { bookQuestionsPrompt, looksLikeQuestions, projectQuestionBank, questionsOn } from '../study/bookQuestions';
import { cancel, enqueue, type JobControl } from './generationQueue';
import { allocateExcerpts } from './allocateEvidence';
import { controllingNote, controllingReport, inferEntity } from '../standards/controlling';
import { classifyTaxSource, yearsAsked } from '../standards/taxSources';
import { chunkPlace, makeSource, needsMoreInfo, pageOrSnippet, parsePicks, pickPrompt, relevantExcerpts, sourceQuestions, withoutSourceMentions, type Candidate, type CourseSource, type Excerpt } from './sources';
import { isOutlineDocument } from '../cpa/outline';
import { stillMissed } from './review';
import { documentStanding } from '../standards/authority';
import { unverifiedFigure } from './citations';
import { crossReferences, refScore } from '../services/rag/sectionRefs';
import { isEnabled, isReference, isTeaching } from '../standards/docRoles';
import { supersededEditions } from '../standards/taxSources';

const MAX_TRIES = 2;
/** The most one model call may take. A call that hangs is stopped (the native model is told to stop), and the lesson fails with a message instead of staying on "Writing...". */
const BASE_CALL_MS = 4 * 60 * 1000;
/** The limit for the model in use, from the speed measured for it (a slow phone is given longer; see timeLimit.ts). */
function callLimit(): number {
  try {
    const id = require('../stores').useAppStore.getState().activeModelId;
    return callLimitMs(id ? require('../atlasTools/speed').useSpeedStats.getState().byModel[id] : undefined);
  } catch { return BASE_CALL_MS; }
}
/** How much longer than the base limits the model in use needs (1 on a fast one). */
const slowness = (): number => callLimit() / BASE_CALL_MS;
/** The most one section's deepening may take, and all of a lesson's deepening together. A section that runs out keeps its short text. */
const SECTION_BASE_MS = 90 * 1000;
const EXPAND_BASE_MS = 6 * 60 * 1000;

/** Tells the phone's model to stop, so a call abandoned after its time limit does not leave the engine busy for the next lesson. */
async function stopModel(): Promise<void> {
  try { await require('../services/llm').llmService.stopGeneration(); } catch { /* nothing was running */ }
}

/** How long the model may read the sources before its first word, from its measured reading speed (3 to 20 minutes). */
function readLimitMs(): number {
  try {
    const id = require('../stores').useAppStore.getState().activeModelId;
    const prefill = id ? require('../atlasTools/speed').useSpeedStats.getState().byModel[id]?.prefill : 0;
    return Math.round(Math.min(20 * 60_000, Math.max(3 * 60_000, ((prefill > 0 ? 3500 / prefill : 60) * 3) * 1000)));
  } catch { return 3 * 60_000; }
}
/** No new word for this long while writing means the model is stuck, however slow it is otherwise. */
const STALL_MS = 2 * 60 * 1000;

/**
 * One model call that is stopped when it stops making progress, not just when it is slow: still reading the sources for too long, no new
 * word for two minutes while writing, or past the overall limit for the model in use (liveWork.ts says which, and the screen shows it).
 */
async function askBounded(system: string, user: string, overallMs = callLimit()): Promise<string> {
  let timer: ReturnType<typeof setInterval> | undefined;
  const readMs = readLimitMs();
  const token = beginWork();
  const asked = Date.now();
  logger.log(`[LESSON] asking the model: ${system.length + user.length} characters in the prompt, limits read ${Math.round(readMs / 1000)} s, overall ${Math.round(overallMs / 1000)} s`);
  const limit = new Promise<never>((_, reject) => {
    timer = setInterval(() => {
      const why = giveUpReason(currentWork(), Date.now(), { readMs, stallMs: STALL_MS, overallMs });
      if (!why) return;
      logger.warn(`[LESSON] stopped: ${why.why}`);
      void stopModel();
      reject(new Error(why.message));
    }, Math.min(2000, Math.max(50, overallMs / 4))); // looks often enough to hold a short limit
    (timer as { unref?: () => void }).unref?.();
  });
  try {
    const answer = await Promise.race([askModel(system, user, (event, content) => { if (event === 'reading') noteReading(token); else noteWriting(token, content); }), limit]);
    logger.log(`[LESSON] answered in ${((Date.now() - asked) / 1000).toFixed(1)} s, ${answer.length} characters`);
    return answer;
  } catch (e) {
    logger.warn(`[LESSON] the call failed after ${((Date.now() - asked) / 1000).toFixed(1)} s: ${String((e as Error)?.message || e).slice(0, 300)}`);
    throw e;
  } finally { if (timer) clearInterval(timer); endWork(token); }
}
/** Squares made of questions: these start from the textbook's own questions when the course's project has them. */
const QUESTION_FORMATS = ['quiz', 'truefalse', 'fill', 'scenario', 'numeric', 'recall', 'practice', 'reading', 'predict', 'fix'];

async function askUntil<T>(prompt: { system: string; user: string }, read: (raw: string) => T | null, about: string | { what: string; stopped: () => boolean }): Promise<T> {
  const { system, user } = prompt;
  const { what, stopped } = typeof about === 'string' ? { what: about, stopped: () => false } : about;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    if (stopped()) throw new Error('Stopped.'); // a Stop or a time-out must not start another model call
    const raw = await askBounded(system, attempt ? `${user}\n\nYour last answer could not be read. Reply with ONLY the JSON, nothing else.` : user);
    const value = read(raw);
    if (value) return value;
    logger.warn(`[LESSON] ${what}: the reply could not be read (try ${attempt + 1} of ${MAX_TRIES}); it began: ${raw.slice(0, 200).replace(/\s+/g, ' ')} ... and ended: ${raw.slice(-120).replace(/\s+/g, ' ')}`);
  }
  throw new Error(`The AI did not write ${what} in a form Atlas can use. Try again, or use a bigger model.`);
}

/** Plans a course for the request and saves it. Returns its id. */
export async function createCourse(request: CourseRequest, sources: CourseSource[] = [], projectId?: string): Promise<string> {
  const plan = await askUntil(planMessages(request, sources.filter((x) => !x.questionBank)), parsePlan, 'a course plan');
  return useTopics.getState().add(request, plan, { sources, projectId });
}

/** All the text of a project's documents, in order (to find the textbook's chapters in). */
async function projectText(projectId: string): Promise<string> {
  const { ragService } = require('../services/rag');
  const parts: string[] = [];
  for (const doc of await ragService.getDocumentsInScope(projectId)) {
    for (const chunk of await ragService.getDocumentChunks(doc.id)) parts.push(String(chunk.content));
  }
  return parts.join('\n');
}

/**
 * A course with one unit per chapter, from ALL the textbooks in the project: the same subject in several books is one unit (written from every
 * book that covers it), and a chapter only one book has is kept. A lesson, key-term cards and a test for each, so no chapter of any book is skipped.
 * Null when no book's chapters can be found (then the AI plans the course).
 */
export async function createChapterCourse(request: CourseRequest, sources: CourseSource[], projectId: string): Promise<string | null> {
  const books = await bookChapters(projectId, isOutlineDocument);
  // Several textbooks are taught one at a time, every chapter of each, in the order the books were added.
  if (books.length > 1) {
    const named = await Promise.all(books.map(async (b) => ({ doc: b.doc, chapters: await withSubjects(b.chapters.map((c) => ({ ...c, size: 0 }))) })));
    const members = books.flatMap((b) => b.chapters.map((c) => ({ doc: b.doc, number: c.number, title: c.title })));
    return useTopics.getState().add(request, bookByBookPlan(named, request.topic), { sources, projectId, bookChapters: members });
  }
  const topics = books.length ? mergeBooks(books) : [];
  // Books whose chapters could not be told apart: fall back to the chapters found in the project's text as a whole.
  const chapters = topics.length >= 3 ? asChapters(topics) : findChapters(await projectText(projectId));
  if (chapters.length < 3) return null;
  return useTopics.getState().add(request, chapterPlan(await withSubjects(chapters), request.topic, books.length > 1), { sources, projectId, bookChapters: topics.flatMap((t) => t.members) });
}

/** Each chapter with what it is mainly about ("Cash", "Liabilities"): named by the AI from the heading and the first lines, or cut from the heading when it cannot be asked. */
async function withSubjects(chapters: Chapter[]): Promise<Chapter[]> {
  const names: Array<string | undefined> = [];
  // Asked 20 chapters at a time: one long list of a whole book was too much for a small model, and every chapter fell back to a cut-off heading.
  for (let at = 0; at < chapters.length; at += 20) {
    const group = chapters.slice(at, at + 20);
    try {
      const prompt = subjectPrompt(group);
      const got = parseSubjects(await askModel(prompt.system, prompt.user), group.length);
      group.forEach((_, i) => { names[at + i] = got?.[i]; });
    } catch { /* the headings alone have to do */ }
  }
  return chapters.map((c, i) => ({ ...c, subject: names[i] && names[i]!.length >= 2 ? names[i] : shortSubject(c.title) }));
}

/** The passages that the given passages point to by section number, one pointer each, not repeating any passage already held. */
export async function followPointers<T extends { name: string; content: string; position?: number; doc_id?: number }>(held: T[], lookup: (query: string) => Promise<{ chunks: T[] } | undefined>): Promise<T[]> {
  const out: T[] = [];
  const key = (c: T) => `${c.doc_id}:${c.position}`;
  const have = new Set(held.map(key));
  for (const c of held) {
    const ref = crossReferences(String(c.content), 1)[0];
    if (!ref) continue;
    const r = await lookup(ref.needles[0]);
    const hit = (r?.chunks ?? []).find((x) => !have.has(key(x)) && refScore(String(x.content), [ref]) >= 2);
    if (hit) { have.add(key(hit)); out.push(hit); }
  }
  return out;
}

/**
 * Passages from ALL the documents of the course's project that match the square. Teaching documents (textbooks, publications, study packs)
 * give the best passage of each book, two at most from one, so no book crowds out the others. Reference documents (the Code, regulations,
 * bulletins, standards) give their passages for the exact section the square is about, to check the lesson against, and are marked so the
 * lesson is not written from raw statute text. An older edition of a work is left out when a newer one is in the project.
 */
async function projectExcerpts(projectId: string | undefined, query: string): Promise<Excerpt[]> {
  if (!projectId) return [];
  try {
    const { ragService } = require('../services/rag');
    const docs: Array<{ name: string; enabled?: number | boolean }> = await ragService.getDocumentsInScope(projectId);
    const old = supersededEditions(docs.filter(isEnabled).map((d) => d.name));
    const usable = (n: string) => !old.has(n) && !isOutlineDocument(n);
    type Chunk = { name: string; content: string; position?: number; doc_id?: number };
    const best = async (include: (n: string) => boolean, topK: number, perDocMax: number): Promise<Chunk[]> => {
      const found = await ragService.searchProject(projectId, query, { topK, include });
      // Passages that are mostly questions belong to a question bank: they are asked from, not read as a lesson.
      const chunks: Chunk[] = (found?.chunks ?? []).filter((c: Chunk) => !looksLikeQuestions(String(c.content)));
      const perDoc = new Map<string, number>();
      return chunks.filter((c) => { const n = perDoc.get(c.name) ?? 0; perDoc.set(c.name, n + 1); return n < perDocMax; });
    };
    const excerpt = (c: Chunk, role: 'teach' | 'reference'): Excerpt => {
      const at = chunkPlace(String(c.content), c.position);
      const st = documentStanding(String(c.name));
      return { source: c.name, docId: c.doc_id, where: at.where, rank: st.rank, label: st.label, role, text: at.text.slice(0, 600) };
    };
    const teach = (await best((n) => usable(n) && isTeaching(n), 14, 2)).map((c) => excerpt(c, 'teach')).sort((a, b) => (a.rank ?? 5) - (b.rank ?? 5));
    const found = (await best((n) => usable(n) && isReference(n), 8, 1)).slice(0, 2);
    // The law points to other sections for its definitions ("as defined in section 168"): follow the first such pointer of each passage.
    const pointed = await followPointers(found, (q) => ragService.searchProject(projectId, q, { topK: 3, include: (n: string) => usable(n) && isReference(n) }));
    const reference = [...found, ...pointed].slice(0, 4).map((c) => excerpt(c, 'reference'));
    // A project with no teaching document (only the law, or only standards) is taught from what it has.
    if (!teach.length) return reference.map((e) => ({ ...e, role: 'teach' as const }));
    return [...teach.slice(0, 8), ...reference];
  } catch { return []; }
}

/** When the learner's own material says little on a square, a quick look online: the top results' pages, kept with their links. Nothing when off-grid or offline. */
/** The most a lesson waits for the web lookup: a slow network must not hold a lesson up. */
const WEB_WAIT_MS = 12000;
async function webExcerpts(query: string): Promise<Excerpt[]> {
  const timeout = new Promise<Excerpt[]>((resolve) => { setTimeout(() => resolve([]), WEB_WAIT_MS).unref?.(); });
  return Promise.race([lookUpOnline(query), timeout]);
}

async function lookUpOnline(query: string): Promise<Excerpt[]> {
  try {
    const { offGridOn } = require('../atlasTools/offGrid');
    if (offGridOn()) return [];
    const { searchWeb } = require('../services/tools/webSearchProviders');
    const { braveSearch, readPage } = require('../services/tools/handlers');
    const { results } = await searchWeb(query, braveSearch);
    const out: Excerpt[] = [];
    for (const r of results.filter((x: { url?: string }) => x.url && /^https?:/.test(x.url)).slice(0, 2)) {
      let text = String(r.snippet || '');
      try { text = String(await readPage(r.url, 1800)) || text; } catch { /* the snippet will do */ }
      if (text.length >= 80) out.push({ source: String(r.title || r.url).slice(0, 80), url: r.url, text: text.slice(0, 900) });
    }
    return out;
  } catch { return []; }
}

/** A quiz whose questions note a right answer that has a figure none of the passages show. */
function withFigureChecks(content: Extract<SquareContent, { kind: 'quiz' }>, excerpts: Excerpt[], bank: string): SquareContent {
  const evidence = `${excerpts.map((e) => e.text).join('\n')}\n${bank}`;
  return { ...content, questions: content.questions.map((q) => { const check = unverifiedFigure(q, evidence); return check ? { ...q, check } : q; }) };
}

/** A lesson with the names of its sources taken out of the writing (they are shown as links). */
function withoutSources(content: SquareContent, excerpts: Excerpt[], bank = ''): SquareContent {
  if (content.kind === 'quiz') return withFigureChecks(content, excerpts, bank);
  if (content.kind !== 'lesson' || !excerpts.length) return content;
  const names = excerpts.map((e) => e.source);
  const clean = (t: string) => withoutSourceMentions(t, names);
  return { ...content, sections: content.sections.map((x) => ({ ...x, text: clean(x.text), example: x.example ? clean(x.example) : undefined })), keyPoints: content.keyPoints.map(clean) };
}

/**
 * The content of a square: kept from before, or written now. Lessons are written one at a time; `background` marks one being prepared
 * ahead, which waits for any lesson the person is actually waiting for.
 */
export const REWRITES = {
  simpler: 'The learner found this unclear. Write it again in simpler words with shorter sentences, define every term the first time it appears, and use a plainer example.',
  example: 'The learner found this unclear. Write it again with a different, fully worked example (problem, working and answer) and keep the explanation short.',
  shorter: 'The learner wants less. Write it again shorter: only the ideas that matter, in a few short paragraphs.',
} as const;
export type Rewrite = keyof typeof REWRITES;

export function squareContent(course: Course, key: string, opts: { background?: boolean; rewrite?: Rewrite } = {}): Promise<SquareContent> {
  const kept = course.content[key];
  if (kept) return Promise.resolve(kept);
  return enqueue(`${course.id}:${key}`, (ctl) => writeSquare({ courseId: course.id, key, rewrite: opts.rewrite }, ctl), { priority: opts.background ? 0 : 1, limitMs: 2 * callLimit() + 60_000, onAbort: stopModel });
}

/** What a square's passages and textbook questions are matched on: its subject alone when it has one, else its title and focus. */
const subjectQuery = (sq: { topic?: string; title: string; focus: string }): string => sq.topic || `${sq.title} ${sq.focus}`;

/** What to check about the controlling authority for this course's subject, from the documents in its project. Empty when nothing is wrong or no project is attached. */
async function standardsFlags(course: Course, query: string): Promise<string> {
  if (!course.projectId) return '';
  try {
    const { ragService } = require('../services/rag');
    const docs: Array<{ name: string; enabled?: number | boolean }> = (await ragService.getDocumentsInScope(course.projectId)).filter(isEnabled);
    const yearOf = (name: string) => classifyTaxSource(name)?.year ?? (Number(/\b(20\d{2})\b/.exec(name)?.[1]) || undefined);
    const entity = inferEntity(`${course.title} ${course.topic}`); // the course decides who the rules are for, never one square's wording
    return controllingNote(controllingReport({ entity, asOfYear: yearsAsked(`${query} ${course.topic}`)[0], documents: docs.map((d) => ({ name: d.name, year: yearOf(d.name) })) }));
  } catch { return ''; }
}

async function writeSquare(target: { courseId: string; key: string; rewrite?: Rewrite }, ctl: JobControl): Promise<SquareContent> {
  const { courseId, key, rewrite } = target;
  // Read the course as it is now: it may have changed (or the square been written) while this waited its turn.
  const course = useTopics.getState().courses.find((c) => c.id === courseId);
  if (!course) throw new Error('That course is not on this phone any more.');
  const kept = course.content[key];
  if (kept) return kept;
  const index = course.squares.findIndex((s) => s.key === key);
  const square = course.squares[index];
  if (!square) throw new Error('That square is not in this course.');
  const before = course.squares.slice(0, index).map((s) => s.title);
  // An exact drill is made by the app in code (no AI, so the answers cannot be wrong). If no drill fits the words, it becomes a calculation square.
  if (square.format === 'drill') {
    const kind = drillFor(subjectQuery(square));
    if (kind) {
      const made: SquareContent = { kind: 'drill', exercises: makeDrillSet(5, Date.now() % 100000, [kind]) };
      useTopics.getState().setContent(course.id, key, made);
      return made;
    }
  }
  if (square.format === 'periodic') {
    const made: SquareContent = { kind: 'periodic', questions: makePeriodicQuestions(Date.now() % 100000, 8) };
    useTopics.getState().setContent(course.id, key, made);
    return made;
  }
  const startedAt = Date.now();
  const asked = square.format === 'drill' ? { ...square, format: 'numeric' as const } : square;
  const query = subjectQuery(square);
  // The standard keeps its place when the books fill the rest, and the books share the room instead of the first one taking it.
  let excerpts: Excerpt[] = allocateExcerpts([...await projectExcerpts(course.projectId, query), ...relevantExcerpts(course.sources ?? [], query)], 7).chosen;
  if (needsMoreInfo(excerpts) && square.format === 'lesson') excerpts = allocateExcerpts([...excerpts, ...await webExcerpts(`${course.topic} ${square.title}`)], 7).chosen;
  const foundAt = Date.now();
  const bank = QUESTION_FORMATS.includes(asked.format) ? bookQuestionsPrompt(questionsOn([...sourceQuestions(course.sources), ...await projectQuestionBank(course.projectId)], subjectQuery(square))) : '';
  const content = await askUntil(contentMessages({
    courseTitle: course.title, topic: course.topic, level: course.request.level, how: course.request.how, style: course.style,
    square: asked, before, minutes: course.request.minutes, difficulty: course.difficulty,
    bookQuestions: bank,
    standardsFlags: await standardsFlags(course, query),
    excerpts,
    retry: asked.format === 'quiz' ? stillMissed(course.id, asked.checkpoint ? 6 : 3) : undefined,
    rewrite: rewrite ? REWRITES[rewrite] : undefined,
  }), (raw) => parseContent(asked.format, raw), { what: `the "${square.title}" square`, stopped: ctl.cancelled });
  // The first pass is a complete lesson: it is saved at once, so it can be read while the optional deepening goes on (or if that fails).
  if (ctl.cancelled()) throw new Error('Stopped.'); // the person pressed Stop (or it timed out) while the model was answering: save nothing
  const draft = withoutSources(content, excerpts, bank);
  // Where the time went, for the Debug Logs screen: finding the passages, then the model writing.
  logger.log(`[LESSON] "${square.title.slice(0, 50)}" (${square.format}): ${foundAt - startedAt} ms finding ${excerpts.length} passages, ${Date.now() - foundAt} ms writing`);
  useTopics.getState().setContent(course.id, key, draft);
  if (excerpts.length) useTopics.getState().setCited(course.id, key, excerpts);
  // Not for a rewrite (shorter, simpler, another example) or an "Another look" lesson: those were asked to be less, or plainer, and widening them would undo that.
  if (content.kind === 'lesson' && shouldDeepen(course, square, rewrite)) {
    enqueue(expandKey(course.id, key), () => expandSquare({ courseId: course.id, key, draft, title: square.title, excerpts, bank }), { priority: 0, limitMs: EXPAND_BASE_MS * slowness(), onAbort: stopModel })
      .catch(() => undefined); // the saved draft stays as it is
  }
  return draft;
}

/** The queue key of a lesson's deepening, apart from the key of writing it. */
const expandKey = (courseId: string, key: string) => `${courseId}:${key}:deepen`;

/** Stops writing a square (and its deepening, if any). The draft already saved is kept. */
export function stopWriting(courseId: string, key: string): void {
  cancel(`${courseId}:${key}`);
  cancel(expandKey(courseId, key));
}

/** Deepens a saved draft, then replaces it - but only if the square still holds that same draft (it was not rewritten, cleared or written again meanwhile). */
async function expandSquare(about: { courseId: string; key: string; draft: SquareContent; title: string; excerpts: Excerpt[]; bank: string }): Promise<void> {
  const { courseId, key, draft } = about;
  const course = useTopics.getState().courses.find((c) => c.id === courseId);
  if (!course || course.content[key] !== draft || draft.kind !== 'lesson') return;
  const deeper = await deepenLesson(course, draft, { title: about.title, excerpts: about.excerpts, sectionMs: SECTION_BASE_MS * slowness(), totalMs: EXPAND_BASE_MS * slowness() - 30_000 });
  const now = useTopics.getState().courses.find((c) => c.id === courseId);
  if (!now || now.content[key] !== draft) return;
  const changedAny = deeper.kind === 'lesson' && deeper.sections.some((x, i) => x !== draft.sections[i]);
  if (changedAny) useTopics.getState().setContent(courseId, key, withoutSources(deeper, about.excerpts, about.bank));
}

/** Whether a reading is written in depth: when the course says so, and not for a rewrite (shorter, simpler, another example) or an "Another look" lesson, which were asked to be less or plainer. */
export const shouldDeepen = (course: Pick<Course, 'readingDepth'>, square: { remedial?: boolean }, rewrite?: unknown): boolean =>
  (course.readingDepth ?? 'deep') === 'deep' && !rewrite && !square.remedial;

/**
 * A reading written in depth: each section of the first pass is written out again as full textbook paragraphs. A section the model cannot
 * deepen (an empty or far shorter answer, or an error) keeps what it had, so the reading is never worse than the short one.
 */
export async function deepenLesson(course: Course, lesson: Extract<SquareContent, { kind: 'lesson' }>, about: { title: string; excerpts: Excerpt[]; sectionMs?: number; totalMs?: number }): Promise<SquareContent> {
  const { title, excerpts } = about;
  const limits = about;
  const passages = excerpts.map((e) => e.text).join('\n').slice(0, 1800);
  const sectionMs = limits.sectionMs ?? SECTION_BASE_MS * slowness();
  const deadline = Date.now() + (limits.totalMs ?? EXPAND_BASE_MS * slowness());
  const sections = [];
  let failures = 0;
  for (const [i, section] of lesson.sections.slice(0, 8).entries()) {
    // Out of time, or the model keeps failing: the remaining sections keep their short text.
    if (Date.now() >= deadline || failures >= 2) { sections.push(section); continue; }
    try {
      const prompt = deepenMessages({
        courseTitle: course.title, topic: course.topic, squareTitle: title, heading: section.heading, text: section.text, example: section.example,
        others: lesson.sections.filter((_, k) => k !== i).map((x) => x.heading).filter(Boolean), excerpts: passages, difficulty: course.difficulty,
      });
      const longer = prose(await askBounded(prompt.system, prompt.user, Math.min(sectionMs, Math.max(1000, deadline - Date.now()))), 5000);
      sections.push(longer.length >= section.text.length * 1.3 && longer.length > 400 ? { ...section, text: longer } : section);
    } catch { failures += 1; sections.push(section); }
  }
  return { ...lesson, sections: [...sections, ...lesson.sections.slice(8)] };
}

/** Asks the AI to mark a practice answer. */
export async function gradeAnswer(input: { task: string; model: string; rubric: string[]; answer: string }): Promise<{ score: number; feedback: string }> {
  return askUntil(gradeMessages(input), parseGrade, 'a mark');
}

/**
 * Finds pages online worth learning this topic from: searches, has the AI pick the best few, reads them. Nothing is kept
 * until the caller saves it, and the person can remove any source afterwards. Needs the internet (not in off-grid mode).
 */
export async function findSources(topic: string, goal: string, onStep: (m: string) => void = () => undefined): Promise<CourseSource[]> {
  const { offGridOn } = require('../atlasTools/offGrid');
  if (offGridOn()) throw new Error('Off-grid mode is on, so Atlas will not look online. Turn it off, or add your own notes instead.');
  const { searchWeb } = require('../services/tools/webSearchProviders');
  const { braveSearch, readPage } = require('../services/tools/handlers');
  onStep('Searching the web...');
  const found: Candidate[] = [];
  for (const query of [`${topic} beginner guide`, `${topic} explained tutorial`]) {
    try {
      const { results } = await searchWeb(query, braveSearch);
      for (const r of results) if (r.url && /^https?:/.test(r.url) && !found.some((f) => f.url === r.url)) found.push({ title: r.title || r.url, snippet: r.snippet || '', url: r.url });
    } catch { /* the other search may still work */ }
  }
  if (!found.length) throw new Error('Could not find anything online. Check the internet connection, or add your own notes instead.');
  const candidates = found.slice(0, 10);
  onStep('Choosing the best sources...');
  let picks: number[] = [];
  try {
    const prompt = pickPrompt({ topic, goal, found: candidates });
    picks = parsePicks(await askModel(prompt.system, prompt.user), candidates.length);
  } catch { /* use the first few */ }
  // The AI's picks come first, then the rest, so a page that will not load is replaced by the next best one instead of ending the search.
  const order = [...(picks.length ? picks : [0, 1, 2, 3]), ...candidates.map((_, i) => i)].filter((i, n, all) => candidates[i] && all.indexOf(i) === n);
  const sources: CourseSource[] = [];
  let lastError = '';
  for (const i of order) {
    if (sources.length >= 4) break;
    const c = candidates[i];
    onStep(`Reading ${c.title.slice(0, 40)}...`);
    let page: string | null = null;
    try { page = await readPage(c.url, 6000); } catch (e) { lastError = String((e as Error)?.message || e); }
    const text = pageOrSnippet(c, page);
    if (text) sources.push(makeSource({ title: c.title, kind: 'web', url: c.url, text }, `src-${Date.now()}-${sources.length}`));
  }
  if (!sources.length) throw new Error(`The pages found could not be read${lastError ? ` (${lastError.slice(0, 80)})` : ''}. Check the internet connection, try a different topic wording, or add your own notes instead.`);
  return sources;
}

/** The whole text of the page (or part) of a project document that a passage came from, for reading it in full. Empty when it cannot be found. */
export async function sourcePage(docId: number, where: string | undefined): Promise<string> {
  try {
    const { ragService } = require('../services/rag');
    const chunks: Array<{ content: string; position: number }> = await ragService.getDocumentChunks(docId);
    const page = /^page (\d+)$/.exec(where ?? '');
    if (page) return chunks.filter((c) => String(c.content).startsWith(`(p. ${page[1]})`)).map((c) => String(c.content).replace(/^\(p\. \d+\)\s*/, '')).join('\n\n');
    const part = /^part (\d+)$/.exec(where ?? '');
    return part ? String(chunks.find((c) => c.position === Number(part[1]) - 1)?.content ?? '') : '';
  } catch { return ''; }
}
