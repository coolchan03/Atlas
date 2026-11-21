import { MIN_ANSWERS, chooseBackend, recordKey, useAccelRecord, type BackendRecord } from '../../../src/atlasTools/accelRecord';

const F = '/models/gemma-4-E2B-it-Q4_0.gguf';
const choose = (suggested: string, candidates: string[], records: Record<string, BackendRecord>) => chooseBackend({ file: F, suggested, candidates, records });
const rec = (o: Partial<BackendRecord>): BackendRecord => ({ loads: 0, loadMs: 0, answers: 0, firstWordMs: 0, failures: 0, ...o });
const book = (entries: Record<string, Partial<BackendRecord>>) => Object.fromEntries(Object.entries(entries).map(([b, r]) => [recordKey(F, b), rec(r)]));

describe('choosing an accelerator from what this phone measured', () => {
  it('keeps the hardware suggestion when nothing has been measured', () => {
    expect(choose('opencl', ['cpu', 'opencl'], {})).toEqual({ backend: 'opencl' });
  });

  it('stops picking an accelerator that keeps failing for this model, and goes to one that has worked', () => {
    const r = book({ opencl: { failures: 3, loads: 1 }, htp: { loads: 2, firstWordMs: 900, answers: 5 } });
    const c = choose('opencl', ['cpu', 'opencl', 'htp'], r);
    expect(c.backend).toBe('htp');
    expect(c.why).toMatch(/opencl failed 3 times/);
  });

  it('falls back to the CPU when the suggestion keeps failing and nothing else has been proven', () => {
    expect(choose('htp', ['cpu', 'htp'], book({ htp: { failures: 2, loads: 0 } })).backend).toBe('cpu');
  });

  it('does not distrust an accelerator for one failure, or for failures outweighed by successes', () => {
    expect(choose('opencl', ['cpu', 'opencl'], book({ opencl: { failures: 1, loads: 0 } })).backend).toBe('opencl');
    expect(choose('opencl', ['cpu', 'opencl'], book({ opencl: { failures: 2, loads: 9 } })).backend).toBe('opencl');
  });

  it('replaces the suggestion only when another has clearly reached the first word sooner, and both have been tried enough', () => {
    const slowGpu = { opencl: { answers: MIN_ANSWERS, firstWordMs: 4000, loads: 1 } };
    expect(choose('opencl', ['cpu', 'opencl'], book({ ...slowGpu, cpu: { answers: MIN_ANSWERS, firstWordMs: 3000, loads: 1 } })).backend).toBe('cpu'); // 25% sooner
    expect(choose('opencl', ['cpu', 'opencl'], book({ ...slowGpu, cpu: { answers: MIN_ANSWERS, firstWordMs: 3600, loads: 1 } })).backend).toBe('opencl'); // 10%: not clear
    expect(choose('opencl', ['cpu', 'opencl'], book({ ...slowGpu, cpu: { answers: MIN_ANSWERS - 1, firstWordMs: 100, loads: 1 } })).backend).toBe('opencl'); // too few answers
    expect(choose('opencl', ['cpu', 'opencl'], book({ opencl: { answers: 1, firstWordMs: 9000 }, cpu: { answers: 9, firstWordMs: 100 } })).backend).toBe('opencl'); // the suggestion is not judged on one answer
  });

  it('is keyed by file name and accelerator, and ignores impossible times', () => {
    const st = useAccelRecord.getState();
    st.forget();
    st.recordLoad('/a/b/Model.GGUF', 'OpenCL', 5000);
    st.recordLoad('/a/b/Model.GGUF', 'opencl', -3);
    st.recordLoad('/a/b/Model.GGUF', 'opencl', 9_999_999);
    expect(useAccelRecord.getState().byKey['model.gguf|opencl']).toMatchObject({ loads: 1, loadMs: 5000 });
  });
});
