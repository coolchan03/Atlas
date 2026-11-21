import { progressSections } from '../../../src/learning/progressSummary';

const practice = { tracked: 12, due: 3, mastered: 4, averageStrength: 0.62 };
const run = (mode: string, accuracy: number, extra: Record<string, unknown> = {}, retest = false) => ({ id: `${mode}${accuracy}`, version: 'v', mode, at: 't', metrics: { total: 20, correct: 12, accuracy, outdatedAnswers: 0, unsupportedCitations: 0, repeatFailures: 0, averageSeconds: 1, items: [], retest, ...extra } }) as any;

describe('progress, in separate parts', () => {
  it('keeps checked knowledge, disagreements, practice and exam apart, with no overall figure', () => {
    const sections = progressSections({ claims: { verified: 5, candidate: 9, disputed: 2 }, openConflicts: 1, practice, exams: [run('memory', 0.7)] });
    expect(sections.map((s) => s.title)).toEqual(['Checked knowledge', 'Claims that disagree', 'Practice', 'Exam']);
    const text = sections.flatMap((s) => s.lines).join('\n');
    expect(text).toContain('5 claims checked against a source');
    expect(text).toContain('9 claims stored but not yet checked');
    expect(text).toContain('2 claims disputed');
    expect(text).toContain('1 conflict between claims waiting for a decision');
    expect(text).toContain('Average strength 62% (how well they are remembered, not exam accuracy)');
    expect(text).not.toMatch(/overall/i);
  });

  it('says plainly when there is nothing yet, rather than showing zeros as progress', () => {
    const text = progressSections({ claims: { verified: 0, candidate: 0, disputed: 0 }, openConflicts: 0, practice: { tracked: 0, due: 0, mastered: 0, averageStrength: 0 }, exams: [] }).flatMap((s) => s.lines);
    expect(text).toEqual(['Nothing stored yet.', 'None open.', 'No practice questions answered yet.', 'No exam taken yet.']);
  });

  it('reads each exam mode by itself, counts only graded questions, and leaves out retests', () => {
    const exams = [run('memory', 0.4, {}, true), run('memory', 0.7, { ungraded: 4 }), run('sources', 0.8, { supportedAccuracy: 0.55 }), run('baseline', 0.5)];
    const lines = progressSections({ claims: { verified: 0, candidate: 0, disputed: 0 }, openConflicts: 0, practice, exams })[3].lines;
    expect(lines).toEqual([
      'Without sources or memory: 50% of 20 graded questions',
      'With sources: 80% of 20 graded questions, 55% counting only answers backed by their sources',
      'With what it learned: 70% of 16 graded questions (4 could not be graded)',
    ]);
  });

  it('reports an exam where nothing could be graded as that, not as 0%', () => {
    const lines = progressSections({ claims: { verified: 0, candidate: 0, disputed: 0 }, openConflicts: 0, practice, exams: [run('baseline', 0, { ungraded: 20 })] })[3].lines;
    expect(lines).toEqual(['Without sources or memory: no question could be graded']);
  });
});
