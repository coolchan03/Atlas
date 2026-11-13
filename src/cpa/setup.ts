/** Makes the four CPA exam projects, each with its own documents and its own checklist. Safe to run again: nothing is duplicated. */
import { useProjectStore } from '../stores/projectStore';
import { EXAMS, type ExamCode } from './blueprints';
import { defaultTopics, useCpa } from './store';

export const projectNameFor = (code: ExamCode): string => `CPA ${code}`;

const tutorPrompt = (code: ExamCode, name: string): string =>
  `You are a patient CPA exam tutor for the ${code} section (${name}). Answer from the documents in this project (the user's own textbooks, notes and question banks) and say which document you used. If the documents do not cover a point, say so and give a general answer clearly marked as not from their materials. When the user answers a practice question wrongly, explain why the right answer is right and why theirs is not, step by step, with the numbers. Never invent a rule, rate, threshold or standard number: if you are not sure, say so and tell them to check the source. Rules change, so remind them to check anything that depends on a tax year or a standard's effective date.`;

/** The project for an exam, created on first use, with its starting checklist. Returns the project id. */
export function setupCpaExam(code: ExamCode): string {
  const store = useCpa.getState();
  const existing = store.exams[code];
  if (existing && useProjectStore.getState().projects.some((p) => p.id === existing.projectId)) return existing.projectId;
  const info = EXAMS.find((e) => e.code === code)!;
  const projects = useProjectStore.getState();
  const found = projects.projects.find((p) => p.name === projectNameFor(code));
  const projectId = found?.id ?? projects.createProject({
    name: projectNameFor(code), description: `${info.name}: textbooks, question banks, notes and practice for the CPA ${code} exam.`,
    systemPrompt: tutorPrompt(code, info.name), icon: '#1D4ED8',
  } as any).id;
  store.setExam(code, { projectId, topics: existing?.topics?.length ? existing.topics : defaultTopics(code) });
  return projectId;
}

export const setupAllCpaExams = (): Record<ExamCode, string> =>
  Object.fromEntries(EXAMS.map((e) => [e.code, setupCpaExam(e.code)])) as Record<ExamCode, string>;
