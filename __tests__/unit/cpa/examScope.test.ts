import { addToPractice } from '../../../src/cpa/importQuestions';
import { organizeCpaInOneProject, previewExamScope, setupAllCpaExams, setupCpaExam, stampExamScope } from '../../../src/cpa/setup';
import { topicEvidence } from '../../../src/cpa/progress';
import { useCpa } from '../../../src/cpa/store';
import { useProjectStore } from '../../../src/stores/projectStore';
import { useExerciseStore } from '../../../src/study/exercises';

const q = (question: string): any => ({ question, answer: 'Neon', alternatives: [], options: ['Oxygen', 'Neon', 'Iron'] });
beforeEach(() => {
  useCpa.setState({ exams: {}, groupProjectId: undefined });
  useExerciseStore.setState({ exercises: {}, progress: {}, daily: {} });
  useProjectStore.setState({ projects: [] } as any);
});

describe('UX-05 exam scope', () => {
  it('setting up the core exams creates zero projects', () => {
    setupAllCpaExams();
    expect(Object.keys(useCpa.getState().exams).sort()).toEqual(['AUD', 'FAR', 'REG']);
    expect(useProjectStore.getState().projects).toHaveLength(0);
  });
  it('never sets up the TCP discipline for the person', () => {
    setupAllCpaExams();
    expect(useCpa.getState().exams.TCP).toBeUndefined();
  });
  it('the optional shared project is ONE project and exams keep their own questions', () => {
    setupAllCpaExams();
    const id = organizeCpaInOneProject();
    organizeCpaInOneProject(id);
    expect(useProjectStore.getState().projects).toHaveLength(1);
    expect(['FAR', 'AUD', 'REG'].every((c) => useCpa.getState().exams[c as 'FAR']?.projectId === id)).toBe(true);
    addToPractice([q('Same text?')], { projectId: id, examCode: 'FAR' }, ['t']);
    addToPractice([q('Same text?')], { projectId: id, examCode: 'AUD' }, ['t']);
    const all = Object.values(useExerciseStore.getState().exercises);
    expect(all).toHaveLength(2); // neither overwrote nor was skipped as a repeat of the other
    expect(new Set(all.map((e) => e.id)).size).toBe(2);
    expect(all.map((e) => e.examCode).sort()).toEqual(['AUD', 'FAR']);
  });
  it('attempts on FAR do not count for AUD even with a shared project', () => {
    const ex = (id: string, examCode: string) => ({ id, kind: 'truefalse', prompt: 'p', answer: true, topic: 'Leases', projectId: 'shared', examCode }) as any;
    const list = [ex('a', 'FAR'), ex('b', 'AUD')];
    const progress = { a: { box: 1, due: 0, attempts: 1, correct: 1, last: true }, b: { box: 0, due: 0, attempts: 0, correct: 0 } };
    expect(topicEvidence(list, progress, { topic: 'Leases', projectId: 'shared', examCode: 'FAR' }).questions).toBe(1);
    expect(topicEvidence(list, progress, { topic: 'Leases', projectId: 'shared', examCode: 'AUD' }).questions).toBe(0);
  });
  it('stamping old per-exam-project questions is additive, idempotent, and skips ambiguous projects', () => {
    useCpa.setState({ exams: { FAR: { projectId: 'pf', topics: [] }, AUD: { projectId: 'pa', topics: [] }, REG: { projectId: 'shared', topics: [] }, BAR: { projectId: 'shared', topics: [] } } as any });
    const mk = (id: string, projectId: string) => ({ id, kind: 'truefalse', prompt: id, answer: true, projectId }) as any;
    useExerciseStore.setState({ exercises: { 1: mk('1', 'pf'), 2: mk('2', 'pa'), 3: mk('3', 'shared'), 4: mk('4', 'other') } });
    expect(previewExamScope().sort((a, b) => a.examCode.localeCompare(b.examCode))).toEqual([{ examCode: 'AUD', questions: 1 }, { examCode: 'FAR', questions: 1 }]);
    expect(stampExamScope()).toBe(2);
    expect(stampExamScope()).toBe(0);
    const ex = useExerciseStore.getState().exercises as any;
    expect([ex[1].examCode, ex[2].examCode, ex[3].examCode, ex[4].examCode]).toEqual(['FAR', 'AUD', undefined, undefined]);
    expect(Object.keys(ex)).toHaveLength(4); // nothing removed, ids unchanged
  });
  it('older installs keep their own exam projects when the shared one is created', () => {
    useCpa.setState({ exams: { FAR: { projectId: 'legacy-far', topics: [] } } as any });
    setupCpaExam('AUD');
    const id = organizeCpaInOneProject();
    expect(useCpa.getState().exams.FAR?.projectId).toBe('legacy-far');
    expect(useCpa.getState().exams.AUD?.projectId).toBe(id);
  });
});
