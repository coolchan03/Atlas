/** Makes a project for each exam you set up (the four CPA sections at once, the others one at a time), each with its own documents and its own checklist. Safe to run again: nothing is duplicated. */
import { useProjectStore } from '../stores/projectStore';
import { CPA_EXAMS, examInfo, examLabel, type ExamCode } from './blueprints';
import { defaultTopics, useCpa } from './store';
import { useExerciseStore, type Exercise } from '../study/exercises';

export const projectNameFor = (code: ExamCode): string => examLabel(code);

const tutorPrompt = (code: ExamCode, name: string): string =>
  `You are a patient exam tutor for ${examLabel(code)} (${name}). Answer from the documents in this project (the user's own textbooks, notes and question banks) and say which document you used. If the documents do not cover a point, say so and give a general answer clearly marked as not from their materials. When the user answers a practice question wrongly, explain why the right answer is right and why theirs is not, step by step, with the numbers. Never invent a rule, rate, threshold or standard number: if you are not sure, say so and tell them to check the source. Rules change, so remind them to check anything that depends on a tax year, a jurisdiction (state or country) or a standard's effective date. You teach for an exam: you are not giving legal, medical, tax or investment advice.`;

export const CPA_PROJECT_NAME = 'CPA Study';
const CPA_PROJECT_NAMES = [CPA_PROJECT_NAME, 'CPA Exam Preparation'];

/** The one project all CPA material lives in: the one chosen before, one found by its name, or a new "CPA Study". Made on first use, never twice. */
export function ensureCpaProject(): string {
  const projects = useProjectStore.getState();
  const known = useCpa.getState().groupProjectId;
  const id = (known && projects.projects.some((p) => p.id === known) ? known : undefined)
    ?? projects.projects.find((p) => CPA_PROJECT_NAMES.includes(p.name))?.id
    ?? projects.createProject({
      name: CPA_PROJECT_NAME, description: 'All your CPA textbooks, notes, question banks and study packs, for FAR, AUD, REG and your discipline. Each exam keeps its own questions and scores.',
      systemPrompt: tutorPrompt('FAR', 'the CPA exam sections').replace('FAR (the CPA exam sections)', 'the CPA exams (FAR, AUD, REG and your discipline)'), icon: '#1D4ED8',
    } as any).id;
  if (known !== id) useCpa.getState().setGroupProject(id);
  return id;
}

/**
 * Sets up an exam with its checklist. A CPA exam uses the one shared CPA Study project (made if it is not there), so every textbook, note
 * and study pack for the CPA is in one place; an exam that already has its own project keeps it, and the other professional exams have none.
 * Returns the exam's project id.
 */
export function setupCpaExam(code: ExamCode): string | undefined {
  const store = useCpa.getState();
  const existing = store.exams[code];
  const projectId = existing?.projectId ?? (examInfo(code).group === 'cpa' ? ensureCpaProject() : undefined);
  if (existing?.topics?.length) {
    if (projectId && !existing.projectId) store.setExam(code, { ...existing, projectId });
    return projectId;
  }
  store.setExam(code, { ...existing, projectId, topics: defaultTopics(code) });
  return projectId;
}

/** The three core CPA sections. The discipline (BAR, ISC or TCP) is the person's own choice and is never set up for them. */
export const CORE_CPA_CODES: ExamCode[] = CPA_EXAMS.map((e) => e.code).filter((c) => ['FAR', 'AUD', 'REG'].includes(c));

export const setupAllCpaExams = (): Record<string, string | undefined> =>
  Object.fromEntries(CORE_CPA_CODES.map((c) => [c, setupCpaExam(c)]));

/**
 * Optional: keep all CPA material in ONE project (an existing one, or a new "CPA Exam Preparation"). Exams that have no project of
 * their own use it; exams that already have their own project keep it (nothing is moved or deleted). Questions stay separated by exam code.
 */
export function organizeCpaInOneProject(existingProjectId?: string): string {
  const projects = useProjectStore.getState();
  const id = existingProjectId && projects.projects.some((p) => p.id === existingProjectId) ? existingProjectId : ensureCpaProject();
  const cpa = useCpa.getState();
  cpa.setGroupProject(id);
  for (const [code, exam] of Object.entries(cpa.exams)) if (exam && !exam.projectId) cpa.setExam(code as ExamCode, { ...exam, projectId: id });
  return id;
}

export interface ScopePreview { examCode: string; questions: number }
/** What the exam-code stamp would touch: unstamped questions whose project belongs to exactly one exam. Pure; changes nothing. */
export function previewExamScope(): ScopePreview[] {
  const owner = new Map<string, string[]>();
  for (const [code, exam] of Object.entries(useCpa.getState().exams)) if (exam?.projectId) owner.set(exam.projectId, [...(owner.get(exam.projectId) ?? []), code]);
  const counts = new Map<string, number>();
  for (const e of Object.values(useExerciseStore.getState().exercises)) {
    const codes = e.projectId ? owner.get(e.projectId) : undefined;
    if (!e.examCode && codes?.length === 1) counts.set(codes[0], (counts.get(codes[0]) ?? 0) + 1);
  }
  return [...counts].map(([examCode, questions]) => ({ examCode, questions }));
}

/**
 * Additive, idempotent migration: marks older questions with their exam code. Nothing is moved, renamed or deleted, ids and progress are
 * unchanged, and questions in a project shared by several exams are left alone (they cannot be told apart). Returns how many were stamped.
 */
export function stampExamScope(): number {
  const owner = new Map<string, string[]>();
  for (const [code, exam] of Object.entries(useCpa.getState().exams)) if (exam?.projectId) owner.set(exam.projectId, [...(owner.get(exam.projectId) ?? []), code]);
  const exercises = useExerciseStore.getState().exercises;
  const stamped: Record<string, Exercise> = {};
  for (const e of Object.values(exercises)) {
    const codes = e.projectId ? owner.get(e.projectId) : undefined;
    if (!e.examCode && codes?.length === 1) stamped[e.id] = { ...e, examCode: codes[0] };
  }
  const n = Object.keys(stamped).length;
  if (n) useExerciseStore.setState({ exercises: { ...exercises, ...stamped } });
  return n;
}
