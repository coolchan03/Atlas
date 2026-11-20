import { applicationPrompt, applicationQuestions } from '../../../src/learning/applicationQuestions';
import { memoryKnowledgeDb } from '../../harness/memoryKnowledgeDb';
import { ingestClaims } from '../../../src/learning/claimIngest';

const claims = ['Boil water for one minute to make it safe.', 'A lease is capitalised when it transfers ownership.'];
const reply = JSON.stringify({ questions: [
  { question: 'Boil water for one minute to make it safe.', answer: 'one minute' },
  { question: 'Priya camps at 3,000 m where water boils sooner. How long should she keep her pot boiling?', answer: 'three minutes', alternatives: ['3 minutes'], topic: 'water' },
  { question: 'Priya camps at 3,000 m where water boils sooner. How long should she keep her pot boiling?', answer: 'three minutes' },
] });

describe('application questions written by the Judge', () => {
  it('keeps new situations with a hidden key, drops a restated claim and repeats', () => {
    const r = applicationQuestions(reply, claims, []);
    expect(r.kept).toHaveLength(1);
    expect(r.kept[0].answer).toBe('three minutes');
    expect(r.familiar).toBe(1);
    expect(applicationQuestions(reply, claims, [r.kept[0].question]).kept).toHaveLength(0);
  });
  it('asks for application, not definitions, and shows only the stored ideas', () => {
    const p = applicationPrompt('water', claims);
    expect(p.user).toMatch(/APPLICATION/);
    expect(p.user).toContain('Boil water for one minute');
  });
});

describe('cards stay inside their own subject', () => {
  it('knownClaims with a subject returns only that subject\'s claims, plus unarchived older ones', () => {
    const db = memoryKnowledgeDb();
    const src = [{ n: 1, title: 'Manual', kind: 'library', passage: 'Boil water for one minute.', retrievedAt: '2026-01-01T00:00:00.000Z' }];
    const archive = (id: string, subject: string) => db.sql(`INSERT INTO atlas_report_archive (id, subject_id, question, report_text, source_text, source_list_json, original_timestamp, judge_status, judge_score, judge_reason, archived_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [id, subject, 'q', 't', '', '[]', 1, 'pass', 8, '', '2026-01-01']);
    archive('a1', 'project-a'); archive('b1', 'project-b');
    const text: Record<string, string> = { a1: 'Boil the water for one minute.', b1: 'Chlorine tablets need thirty minutes to work.', old: 'Filter cloudy water through a clean cloth first.' };
    for (const id of ['a1', 'b1', 'old']) ingestClaims(db, { topic: 'water', question: `q ${id}`, reportId: id, reportText: `ANSWER: ${text[id]} [1]`, sources: [{ ...src[0], passage: text[id] }], reportStatus: 'candidate', reportNote: '' });
    const ids = (subject?: string) => db.knownClaims('water', 50, subject).map((k) => k.id.split(':')[0]).sort();
    expect(ids('project-a')).toEqual(['a1', 'old']);
    expect(ids('project-b')).toEqual(['b1', 'old']);
    expect(ids()).toEqual(['a1', 'b1', 'old']);
  });
});
