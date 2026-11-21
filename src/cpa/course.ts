/**
 * Each professional exam (CPA, bar, CFA and the rest) is its own board-game course, like every other thing you learn: six squares for each topic on the checklist
 * (the reading, key terms, a worked example, a quiz, an assignment and a chapter exam), a review exam at the end of each area and a whole-exam check last. The course belongs to the exam's project, so every square is written from the
 * textbooks and notes added there. The plan is made here from the checklist, with no AI, so the board always matches the topics.
 */
import { useTopics, type Course } from '../topics/store';
import type { CoursePlan, PlannedSquare } from '../topics/formats';
import { CHAPTER_SQUARES, MAX_CHAPTER_SQUARES, deepChapter } from '../topics/chapterSequence';
import { examInfo, examLabel, type ExamCode } from './blueprints';
import { useCpa, type CpaTopic } from './store';
import { isOutlineDocument } from './outline';
import { REVIEW_EVERY } from '../topics/chapters';


/** The board for an exam's topics. Areas become units; every topic is a chapter of six squares, and each area ends with a review exam. */
/** Every exam board has at least this many squares: a chapter gets up to 14 when the topics are few. */
export const MIN_EXAM_SQUARES = 100;

export function examPlan(code: ExamCode, topics: CpaTopic[]): CoursePlan {
  const info = examInfo(code);
  const areas = [...new Set(topics.map((t) => t.area))];
  // Chapters are six squares; with few topics each gets more practice (up to fourteen) so the board reaches the minimum.
  const size = topics.length ? Math.min(MAX_CHAPTER_SQUARES, Math.max(CHAPTER_SQUARES, Math.ceil((MIN_EXAM_SQUARES - areas.length - 1) / topics.length))) : CHAPTER_SQUARES;
  const squares: PlannedSquare[] = [];
  const add = (sq: Omit<PlannedSquare, 'key'>) => { squares.push({ key: `s${squares.length + 1}`, ...sq }); };
  for (const area of areas) {
    const inArea = topics.filter((x) => x.area === area);
    inArea.forEach((t, i) => {
      deepChapter({ name: t.name, unit: area, about: `for the ${examLabel(code)} exam (${area})` }, size).forEach(add);
      // A bigger exam over the last few topics, so a long area is not one long stretch with a single test at the end.
      if ((i + 1) % REVIEW_EVERY === 0 && i + 1 < inArea.length) {
        add({ format: 'quiz', title: `${area}: topics ${i + 1 - REVIEW_EVERY + 1}-${i + 1} review exam`.slice(0, 60), focus: `Mixed questions on ${inArea.slice(i + 1 - REVIEW_EVERY, i + 1).map((x) => x.name).join(', ')}`, unit: area, checkpoint: true });
      }
    });
    add({ format: 'quiz', title: `${area}: review exam`.slice(0, 60), focus: `Everything in: ${area}`, unit: area, checkpoint: true });
  }
  add({ format: 'quiz', title: 'Whole exam check', focus: `Mixed questions from every area of the ${examLabel(code)} exam`, unit: areas[areas.length - 1] ?? 'Exam', checkpoint: true });
  return {
    title: `${examLabel(code)}: ${info.name}`, summary: `Work through every topic on the ${code} checklist: read it, learn its terms, see it worked, then quiz, assignment and chapter exam.`,
    style: 'Six or more squares for each topic, written from your own textbooks and notes: the reading, key terms, a worked example, a quiz, an assignment, extra practice when the topics are few, and a chapter exam.', theme: `${code} exam board`, squares,
  };
}

/** A rebuilt board keeps what was played: squares with the same title as on the old board keep their stars and the lesson already written. */
function carryOver(old: Course, newId: string): void {
  const fresh = useTopics.getState().courses.find((c) => c.id === newId);
  if (!fresh) return;
  for (const sq of fresh.squares) {
    const was = old.squares.find((o) => o.title === sq.title && o.format === sq.format);
    if (!was) continue;
    const content = old.content[was.key];
    if (content) useTopics.getState().setContent(newId, sq.key, content);
    const stars = old.progress[was.key]?.stars;
    if (stars) useTopics.getState().complete(newId, sq.key, stars);
  }
}

/** Finds every chapter of every textbook in the exam's project and keeps it on the course, so the board can show what each book covers. Best effort: no books, or a failure, leaves the board as it was. */
function noteBookChapters(courseId: string, projectId: string): void {
  Promise.resolve().then(async () => {
    const { bookChapters } = require('../topics/multiBook');
    const books = await bookChapters(projectId, isOutlineDocument);
    const chapters = (books as Array<{ doc: string; chapters: Array<{ number: number; title: string }> }>).flatMap((b) => b.chapters.map((c) => ({ doc: b.doc, number: c.number, title: c.title })));
    if (chapters.length) useTopics.getState().setBookChapters(courseId, chapters);
  }).catch(() => undefined);
}

/** The exam's course id, making the course on first use (or again if it was deleted). Null when the exam is not set up. */
export function ensureExamCourse(code: ExamCode, fresh = false): string | null {
  const exam = useCpa.getState().exams[code];
  if (!exam) return null;
  const existing = exam.courseId;
  if (!fresh && existing && useTopics.getState().courses.some((c) => c.id === existing)) return existing;
  const before = existing ? useTopics.getState().courses.find((c) => c.id === existing) : undefined;
  if (existing) useTopics.getState().remove(existing);
  const info = examInfo(code);
  const id = useTopics.getState().add(
    { topic: `${examLabel(code)}: ${info.name}`, goal: `Pass the ${examLabel(code)} exam`, level: 'Preparing for the exam', how: 'Lessons then quizzes', minutes: 20 },
    examPlan(code, exam.topics), { projectId: exam.projectId });
  if (before) carryOver(before, id);
  useCpa.getState().setCourse(code, id);
  if (exam.projectId) noteBookChapters(id, exam.projectId);
  return id;
}

/** Whether the board's square for this topic has been played. */
export function boardCovers(course: Course | undefined, topicName: string): boolean {
  const square = course?.squares.find((s) => s.format === 'lesson' && s.title === topicName.slice(0, 60));
  return !!square && !!course!.progress[square.key];
}
