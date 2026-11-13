import { check, pruneBank, useExerciseStore, type Exercise } from '../../src/study/exercises';
import { scoreAnswer } from '../../src/learning/exams';
import { useSchedule } from '../../src/schedule/store';
import { generationService } from '../../src/services/generationService';

const mcq0 = { id: 'm', kind: 'mcq', prompt: 'p', choices: ['a', 'b'], answer: 0 } as Exercise;
const tfFalse = { id: 't', kind: 'truefalse', prompt: 'p', answer: false } as Exercise;
const mk = (i: number, projectId?: string): Exercise => ({ id: `e${i}`, kind: 'fill', prompt: `q${i}`, answers: ['x'], projectId });

describe('T01 MCQ option 0', () => {
  it.each([null, '', undefined, false, 'a', -1, 0.5])('does not accept %p as option 0', (v) => expect(check(mcq0, v).correct).toBe(false));
  it.each([0, '0', ' 0 '])('accepts %p as option 0', (v) => expect(check(mcq0, v).correct).toBe(true));
  it('rejects wrong index', () => expect(check(mcq0, 1).correct).toBe(false));
});
describe('T02 true/false', () => {
  it.each(['banana', 'not true', '', null, undefined])('arbitrary %p is not "false"', (v) => expect(check(tfFalse, v).correct).toBe(false));
  it.each([false, 'false', 'False'])('accepts %p', (v) => expect(check(tfFalse, v).correct).toBe(true));
  it('true key still works', () => expect(check({ ...tfFalse, answer: true } as Exercise, 'true').correct).toBe(true));
});
describe('T03 exam scoring', () => {
  const exp = { facts: [['20']] } as any;
  it.each(['not 20', '120', "it isn't 20", 'no 20'])('rejects %p', (a) => expect(scoreAnswer(a, exp).correct).toBe(false));
  it.each(['20', 'The answer is 20.', '20%', '20 USD', '20.0'])('accepts %p', (a) => expect(scoreAnswer(a, { facts: [['20', '20.0']] } as any).correct).toBe(true));
});
describe('T04 scoped clear', () => {
  it('only removes the chosen project', () => {
    const st = useExerciseStore.getState();
    useExerciseStore.setState({ exercises: {}, progress: {}, daily: { '2026-01-01': 3 } });
    st.addSet([mk(1, 'far'), mk(2, 'far'), mk(3, 'aud'), mk(4)]);
    st.record('e3', true);
    useExerciseStore.getState().clearProject('far');
    const after = useExerciseStore.getState();
    expect(Object.keys(after.exercises).sort()).toEqual(['e3', 'e4']);
    expect(after.progress.e3.correct).toBe(1);
    expect(after.daily['2026-01-01']).toBe(3);
  });
});
describe('T05 no silent caps', () => {
  it('keeps 3,001 exercises', () => {
    const bank = Object.fromEntries(Array.from({ length: 3001 }, (_, i) => [`e${i}`, mk(i)]));
    expect(Object.keys(pruneBank(bank, {}, []).exercises)).toHaveLength(3001);
  });
  it('keeps 31 scheduled tasks', () => {
    useSchedule.setState({ tasks: [] });
    for (let i = 0; i < 31; i++) useSchedule.getState().add({ name: `t${i}`, kind: 'prompt', prompt: 'p', repeat: 'daily' as any, hour: 8, minute: 0 });
    expect(useSchedule.getState().tasks).toHaveLength(31);
  });
});
describe('T09 queue isolation', () => {
  it('never merges messages from different chats or modes', async () => {
    const svc: any = generationService;
    const seen: any[] = [];
    svc.queueProcessor = async (m: any) => { seen.push(m); };
    svc.state = { ...svc.state, isGenerating: false, queuedMessages: [
      { id: '1', conversationId: 'A', text: 'a1', messageText: 'a1' },
      { id: '2', conversationId: 'A', text: 'a2', messageText: 'a2' },
      { id: '3', conversationId: 'B', text: 'b1', messageText: 'b1', attachments: [{ id: 'x' }] },
      { id: '4', conversationId: 'B', text: 'img', messageText: 'img', imageMode: 'force' },
    ] };
    svc.processNextInQueue();
    expect(seen[0]).toMatchObject({ conversationId: 'A', text: 'a1\n\na2' });
    expect(svc.state.queuedMessages.map((m: any) => m.id)).toEqual(['3', '4']);
    svc.processNextInQueue();
    expect(seen[1]).toMatchObject({ conversationId: 'B', text: 'b1' });
    expect(seen[1].attachments).toHaveLength(1);
    svc.processNextInQueue();
    expect(seen[2]).toMatchObject({ id: '4', imageMode: 'force' });
  });
});

describe('T11 execution-time tool authorization', () => {
  it('refuses a built-in tool that is not enabled for the chat', async () => {
    jest.resetModules();
    const { executeToolCall } = require('../../src/services/tools/handlers');
    const r = await executeToolCall({ id: '1', name: 'update_project_document', arguments: { name: 'a', content: 'b' } });
    expect(`${r.content}${r.error ?? ''}`).toMatch(/not in a project/); // no project: nothing is written
  });
});
