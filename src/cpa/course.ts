/**
 * Each professional exam (CPA, bar, CFA and the rest) is its own board-game course, like every other thing you learn: one lesson square for each topic on the checklist,
 * a quiz at the end of each area and a whole-exam quiz last. The course belongs to the exam's project, so every square is written from the
 * textbooks and notes added there. The plan is made here from the checklist, with no AI, so the board always matches the topics.
 */
import { useTopics, type Course } from '../topics/store';
import type { CoursePlan, PlannedSquare } from '../topics/formats';
import { examInfo, examLabel, type ExamCode } from './blueprints';
import { useCpa, type CpaTopic } from './store';

const MAX = 60;

/** The board for an exam's topics. Areas become units; when there are too many topics the area quizzes are dropped first. */
export function examPlan(code: ExamCode, topics: CpaTopic[]): CoursePlan {
  const info = examInfo(code);
  const areas = [...new Set(topics.map((t) => t.area))];
  const withQuizzes = topics.length + areas.length + 1 <= MAX;
  const squares: PlannedSquare[] = [];
  const add = (sq: Omit<PlannedSquare, 'key'>) => { if (squares.length < MAX) squares.push({ key: `s${squares.length + 1}`, ...sq }); };
  for (const area of areas) {
    for (const t of topics.filter((x) => x.area === area)) add({ format: 'lesson', title: t.name.slice(0, 60), focus: `${t.name} for the ${examLabel(code)} exam (${area})`, unit: area });
    if (withQuizzes) add({ format: 'quiz', title: `${area}: check`.slice(0, 60), focus: `Everything in: ${area}`, unit: area, checkpoint: true });
  }
  add({ format: 'quiz', title: 'Whole exam check', focus: `Mixed questions from every area of the ${examLabel(code)} exam`, unit: areas[areas.length - 1] ?? 'Exam', checkpoint: true });
  return {
    title: `${examLabel(code)}: ${info.name}`, summary: `Learn every topic on the ${code} checklist, then check yourself.`,
    style: 'One lesson for each topic, written from your own textbooks and notes, with a quiz after each area.', theme: `${code} exam board`, squares,
  };
}

/** The exam's course id, making the course on first use (or again if it was deleted). Null when the exam is not set up. */
export function ensureExamCourse(code: ExamCode, fresh = false): string | null {
  const exam = useCpa.getState().exams[code];
  if (!exam) return null;
  const existing = exam.courseId;
  if (!fresh && existing && useTopics.getState().courses.some((c) => c.id === existing)) return existing;
  if (existing) useTopics.getState().remove(existing);
  const info = examInfo(code);
  const id = useTopics.getState().add(
    { topic: `${examLabel(code)}: ${info.name}`, goal: `Pass the ${examLabel(code)} exam`, level: 'Preparing for the exam', how: 'Lessons then quizzes', minutes: 20 },
    examPlan(code, exam.topics), { projectId: exam.projectId });
  useCpa.getState().setCourse(code, id);
  return id;
}

/** Whether the board's square for this topic has been played. */
export function boardCovers(course: Course | undefined, topicName: string): boolean {
  const square = course?.squares.find((s) => s.format === 'lesson' && s.title === topicName.slice(0, 60));
  return !!square && !!course!.progress[square.key];
}
