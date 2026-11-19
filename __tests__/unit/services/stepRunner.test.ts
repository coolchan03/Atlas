import { finalPrompt, MAX_STEPS, parsePlan, runSteps, workThroughSteps, type PlanStep } from '../../../src/services/stepRunner';

const steps = (n: number): PlanStep[] => Array.from({ length: n }, (_, i) => ({ n: i + 1, title: `step ${i + 1}` }));

describe('step plan', () => {
  it('reads a JSON plan, caps its length, and drops tools that are not enabled', () => {
    const raw = `Here: ${JSON.stringify([{ title: 'Find the rate', tool: 'web_search', args: { query: 'rate' } }, { title: 'Add it up', tool: 'hack', args: { x: 1 } }, { title: '' }, ...Array.from({ length: 10 }, (_, i) => ({ title: `s${i}` }))])}`;
    const plan = parsePlan(raw, ['web_search', 'calculator'])!;
    expect(plan).toHaveLength(MAX_STEPS);
    expect(plan[0]).toMatchObject({ n: 1, tool: 'web_search', args: { query: 'rate' } });
    expect(plan[1].tool).toBeUndefined(); // not enabled: a plain reasoning step
    expect(plan.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('is null for anything that is not a usable plan', () => {
    expect(parsePlan('no list here', [])).toBeNull();
    expect(parsePlan('[not json]', [])).toBeNull();
    expect(parsePlan('[{"title": ""}, {"x": 1}]', [])).toBeNull();
    expect(parsePlan('{"title": "a"}', [])).toBeNull();
  });
});

describe('running steps', () => {
  it('runs in order, passes earlier results on, and reports progress', async () => {
    const seen: string[] = []; const progress: string[] = [];
    const { results } = await runSteps(steps(3), { shouldStop: () => false, onProgress: (d, t, title) => progress.push(`${d}/${t} ${title}`), run: async (s, earlier) => { seen.push(`${s.n}:${earlier.length}`); return `out${s.n}`; } });
    expect(seen).toEqual(['1:0', '2:1', '3:2']);
    expect(results.map((r) => r.output)).toEqual(['out1', 'out2', 'out3']);
    expect(progress[0]).toBe('0/3 step 1');
  });
  it('retries a failed step a bounded number of times, then stops the plan', async () => {
    let calls = 0;
    const { results } = await runSteps(steps(3), { shouldStop: () => false, run: async (s) => { calls += 1; if (s.n === 2) throw new Error('tool down'); return 'ok'; } });
    expect(calls).toBe(1 + 2); // step 1 once, step 2 twice; step 3 never
    expect(results[1]).toMatchObject({ ok: false, attempts: 2, error: 'tool down' });
    expect(results).toHaveLength(2);
  });
  it('succeeds on a retry', async () => {
    let n = 0;
    const { results } = await runSteps(steps(1), { shouldStop: () => false, run: async () => { n += 1; if (n === 1) throw new Error('flaky'); return 'fine'; } });
    expect(results[0]).toMatchObject({ ok: true, attempts: 2 });
  });
  it('gives up on a step that hangs, and stops when asked', async () => {
    jest.useFakeTimers();
    try {
      const p = runSteps(steps(2), { shouldStop: () => false, stepTimeoutMs: 1000, maxAttempts: 1, run: () => new Promise(() => undefined) });
      await jest.advanceTimersByTimeAsync(1001);
      const r = await p;
      expect(r.results[0]).toMatchObject({ ok: false });
      expect(r.results[0].error).toMatch(/took longer/);
    } finally { jest.useRealTimers(); }
    let stop = false;
    const out = await runSteps(steps(3), { shouldStop: () => stop, run: async (s) => { if (s.n === 1) stop = true; return 'x'; } });
    expect(out.stopped).toBe(true);
    expect(out.results).toHaveLength(1);
  });
});

describe('final answer and the whole flow', () => {
  it('says what failed or was not run, and what was stopped', () => {
    const f = finalPrompt('goal', [{ n: 1, title: 'a', ok: true, output: 'A', attempts: 1 }, { n: 2, title: 'b', ok: false, output: '', attempts: 2, error: 'boom' }], { planned: 4, stopped: false });
    expect(f.user).toContain('Step 2 (b) FAILED after 2 tries: boom');
    expect(f.user).toContain('2 later steps were not run');
    expect(finalPrompt('g', [], { planned: 2, stopped: true }).user).toContain('stopped the work early');
    expect(f.system).toMatch(/ONLY the step results/);
  });
  it('plans, runs a tool step and a thinking step, and answers from the results', async () => {
    const asked: string[] = [];
    const ask = jest.fn(async (system: string, user: string) => {
      asked.push(user);
      if (system.startsWith('You break')) return JSON.stringify([{ title: 'add numbers', tool: 'calculator', args: { expression: '2+2' } }, { title: 'explain it' }]);
      if (system.startsWith('Write the final')) return ' The answer is 4. ';
      return 'explained';
    });
    const tool = jest.fn(async () => '4');
    const out = await workThroughSteps('what is 2+2 and why', { ask, tool, enabledTools: ['calculator'], shouldStop: () => false });
    expect(tool).toHaveBeenCalledWith('calculator', { expression: '2+2' });
    expect(out!.answer).toBe('The answer is 4.');
    expect(asked[asked.length - 1]).toContain('Step 1 (add numbers) result:\n4');
    expect(asked.some((u) => u.includes('EARLIER RESULTS') && u.includes('Step 1: 4'))).toBe(true);
  });
  it('returns null when the plan is unusable, and never calls a tool that is not enabled', async () => {
    const tool = jest.fn();
    expect(await workThroughSteps('x', { ask: async () => 'sorry', tool, enabledTools: [], shouldStop: () => false })).toBeNull();
    const out = await workThroughSteps('x', { ask: async (s) => (s.startsWith('You break') ? '[{"title":"a","tool":"shell"}]' : 'ok'), tool, enabledTools: [], shouldStop: () => false });
    expect(tool).not.toHaveBeenCalled();
    expect(out!.results[0].ok).toBe(true);
  });
});
