/**
 * Makes courses and their squares with the AI on the phone. Everything the AI writes is checked by formats.ts; a bad answer is
 * asked for once more before giving up with a message the person can act on.
 */
import { askModel } from '../study/engine';
import { drillFor, makeDrillSet } from '../study/drills';
import { makePeriodicQuestions } from '../study/periodicQuiz';
import { contentMessages, gradeMessages, parseContent, parseGrade, parsePlan, planMessages, type CourseRequest, type SquareContent } from './formats';
import { useTopics, type Course } from './store';
import { chapterPlan, findChapters } from './chapters';
import { bookQuestionsPrompt, looksLikeQuestions, projectQuestionBank, questionsOn } from '../study/bookQuestions';
import { enqueue } from './generationQueue';
import { chunkPlace, makeSource, needsMoreInfo, parsePicks, pickPrompt, relevantExcerpts, sourceQuestions, withoutSourceMentions, type Candidate, type CourseSource, type Excerpt } from './sources';
import { isOutlineDocument } from '../cpa/outline';
import { stillMissed } from './review';

const MAX_TRIES = 2;
/** Squares made of questions: these start from the textbook's own questions when the course's project has them. */
const QUESTION_FORMATS = ['quiz', 'truefalse', 'fill', 'scenario', 'numeric', 'recall', 'practice', 'reading', 'predict', 'fix'];

async function askUntil<T>(prompt: { system: string; user: string }, read: (raw: string) => T | null, what: string): Promise<T> {
  const { system, user } = prompt;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const raw = await askModel(system, attempt ? `${user}\n\nYour last answer could not be read. Reply with ONLY the JSON, nothing else.` : user);
    const value = read(raw);
    if (value) return value;
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
  for (const doc of await ragService.getDocumentsByProject(projectId)) {
    for (const chunk of await ragService.getDocumentChunks(doc.id)) parts.push(String(chunk.content));
  }
  return parts.join('\n');
}

/**
 * A course with one unit per chapter of the textbook in the project: a lesson, key-term cards and a test of that chapter, in the book's own
 * order. Made in code from the chapter headings, so no chapter is skipped. Null when the book's chapters cannot be found (then the AI plans the course).
 */
export async function createChapterCourse(request: CourseRequest, sources: CourseSource[], projectId: string): Promise<string | null> {
  const chapters = findChapters(await projectText(projectId));
  if (chapters.length < 3) return null;
  return useTopics.getState().add(request, chapterPlan(chapters, request.topic), { sources, projectId });
}

/** Passages from the shared documents of the course's project that match the square (none when there is no project or no documents). */
async function projectExcerpts(projectId: string | undefined, query: string): Promise<Excerpt[]> {
  if (!projectId) return [];
  try {
    const { ragService } = require('../services/rag');
    const found = await ragService.searchProject(projectId, query);
    // Passages that are mostly questions belong to a question bank: they are asked from, not read as a lesson.
    return (found?.chunks ?? []).filter((c: { name: string; content: string }) => !isOutlineDocument(String(c.name)) && !looksLikeQuestions(String(c.content))).slice(0, 3).map((c: { name: string; content: string; position?: number; doc_id?: number }) => { const at = chunkPlace(String(c.content), c.position); return { source: c.name, docId: c.doc_id, where: at.where, text: at.text.slice(0, 700) }; });
  } catch { return []; }
}

/** When the learner's own material says little on a square, a quick look online: the top results' pages, kept with their links. Nothing when off-grid or offline. */
async function webExcerpts(query: string): Promise<Excerpt[]> {
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

/** A lesson with the names of its sources taken out of the writing (they are shown as links). */
function withoutSources(content: SquareContent, excerpts: Excerpt[]): SquareContent {
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
  return enqueue(`${course.id}:${key}`, () => writeSquare(course.id, key, opts.rewrite), opts.background ? 0 : 1);
}

async function writeSquare(courseId: string, key: string, rewrite?: Rewrite): Promise<SquareContent> {
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
    const kind = drillFor(`${square.title} ${square.focus}`);
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
  const asked = square.format === 'drill' ? { ...square, format: 'numeric' as const } : square;
  const query = `${square.title} ${square.focus}`;
  let excerpts: Excerpt[] = [...await projectExcerpts(course.projectId, query), ...relevantExcerpts(course.sources ?? [], query)].slice(0, 5);
  if (needsMoreInfo(excerpts) && square.format === 'lesson') excerpts = [...excerpts, ...await webExcerpts(`${course.topic} ${square.title}`)].slice(0, 5);
  const content = await askUntil(contentMessages({
    courseTitle: course.title, topic: course.topic, level: course.request.level, how: course.request.how, style: course.style,
    square: asked, before, minutes: course.request.minutes, difficulty: course.difficulty,
    bookQuestions: QUESTION_FORMATS.includes(asked.format) ? bookQuestionsPrompt(questionsOn([...sourceQuestions(course.sources), ...await projectQuestionBank(course.projectId)], `${square.title} ${square.focus}`)) : '',
    excerpts,
    retry: asked.format === 'quiz' ? stillMissed(course.id, asked.checkpoint ? 6 : 3) : undefined,
    rewrite: rewrite ? REWRITES[rewrite] : undefined,
  }), (raw) => parseContent(asked.format, raw), `the "${square.title}" square`);
  const written = withoutSources(content, excerpts);
  useTopics.getState().setContent(course.id, key, written);
  if (excerpts.length) useTopics.getState().setCited(course.id, key, excerpts);
  return written;
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
  const chosen = (picks.length ? picks : [0, 1, 2, 3]).map((i) => candidates[i]).filter(Boolean).slice(0, 4);
  const sources: CourseSource[] = [];
  for (const c of chosen) {
    onStep(`Reading ${c.title.slice(0, 40)}...`);
    try {
      const text: string = await readPage(c.url, 6000);
      if (text && text.length >= 300) sources.push(makeSource({ title: c.title, kind: 'web', url: c.url, text }, `src-${Date.now()}-${sources.length}`));
    } catch { /* skip a page that will not load */ }
  }
  if (!sources.length) throw new Error('The pages found could not be read. Try again, or add your own notes instead.');
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
