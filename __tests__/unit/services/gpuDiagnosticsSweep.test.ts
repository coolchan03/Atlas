/** The GPU test sweep with the model loader scripted: which settings work, the picture check, stopping, the report. */
const mockLoad = jest.fn(async (..._a: unknown[]) => undefined);
const mockState = { check: { ok: true, reason: '', text: 'Hello there', tokens: [{ id: 5, topProbability: 0.9 }], tokensPerSecond: 7, firstTokenMs: 90 } as any, vision: true, reply: 'red', short: 'ok', mtp: false };
jest.mock('../../../src/services/llm', () => ({
  llmService: {
    loadModel: (...a: unknown[]) => mockLoad(...a), unloadModel: async () => undefined,
    getLastOutputCheck: () => mockState.check, runOutputCheck: async () => mockState.check,
    getShortPromptStatus: () => mockState.short, scanPromptLengths: async () => ['1 token: wrong', '8 tokens: right'],
    supportsVision: () => mockState.vision, generateResponse: async () => mockState.reply, isMtpActive: () => mockState.mtp,
  },
}));

import { installNativeBoundary } from '../../harness/nativeBoundary';

function load() {
  jest.resetModules();
  const boundary = installNativeBoundary({ fs: true });
  boundary.fs!.seedFile('/models/m.gguf', 1024);
  boundary.fs!.seedFile('/models/proj.gguf', 1024);
  boundary.fs!.seedFile('/models/draft.gguf', 1024);
  return { diag: require('../../../src/services/gpuDiagnostics'), model: { fileName: 'm.gguf', filePath: '/models/m.gguf', mmProjPath: '/models/proj.gguf', draftPath: '/models/draft.gguf' } as any };
}
beforeEach(() => { mockLoad.mockClear(); Object.assign(mockState, { check: { ok: true, reason: '', text: 'Hello there', tokens: [{ id: 5, topProbability: 0.9 }], tokensPerSecond: 7, firstTokenMs: 90 }, vision: true, reply: 'red', short: 'ok', mtp: false }); });

describe('sweepSettings', () => {
  it('tries the CPU three ways, then each GPU layer count, then a one-token prompt, and optionally the MTP file', () => {
    const { diag } = load();
    expect(diag.sweepSettings().map((s: any) => s.label)).toEqual(expect.arrayContaining([expect.stringMatching(/optimized ARM kernels off/), expect.stringMatching(/24 layers/), expect.stringMatching(/batch 1/)]));
    expect(diag.sweepSettings([], {}).some((s: any) => s.backend === 'opencl')).toBe(false);
    expect(diag.sweepSettings([8], { mtp: true }).some((s: any) => s.mtp)).toBe(true);
  });
});

describe('runModelSweep', () => {
  it('runs every setting, checks the files and the picture on the best GPU setting, and reports what worked', async () => {
    const { diag, model } = load();
    const lines: string[] = [];
    const result = await diag.runModelSweep(model, { layers: [8], onProgress: (l: string) => lines.push(l) });
    expect(result.steps.length).toBe(diag.sweepSettings([8], { mtp: true }).length);
    expect(result.steps.every((s: any) => s.ok)).toBe(true);
    expect(result.best?.backend).toBe('opencl');
    expect(result.files).toHaveLength(3);
    expect(result.vision).toMatchObject({ ok: true });
    expect(result.report).toContain('Working GPU settings');
    expect(result.steps.find((s: any) => s.scan)).toBeTruthy();
    expect(lines.some((l) => /Picture check/.test(l))).toBe(true);
  });

  it('notes the workaround for short prompts and whether the MTP file started', async () => {
    mockState.short = 'workaround'; mockState.mtp = true;
    const { diag, model } = load();
    const result = await diag.runModelSweep(model, { layers: [8] });
    expect(result.steps.some((s: any) => /first-word workaround/.test(s.note ?? ''))).toBe(true);
    expect(result.steps.some((s: any) => /MTP drafting was active/.test(s.note ?? ''))).toBe(true);
    mockState.short = 'unfixed'; mockState.mtp = false;
    const again = await diag.runModelSweep(model, { layers: [8] });
    expect(again.steps.some((s: any) => /may still start with a wrong word/.test(s.note ?? ''))).toBe(true);
    expect(again.steps.some((s: any) => /did not start/.test(s.note ?? ''))).toBe(true);
  });

  it('records a failed output check and a load that throws, and says no setting worked', async () => {
    mockState.check = { ok: false, reason: 'it wrote placeholder tokens', text: '<unused1>', tokens: [{ id: 1, topProbability: 0.0001 }], tokensPerSecond: 1, firstTokenMs: 1 };
    const { diag, model } = load();
    const bad = await diag.runModelSweep({ ...model, mmProjPath: undefined, draftPath: undefined }, { layers: [8] });
    expect(bad.steps.every((s: any) => !s.ok && /placeholder/.test(s.error))).toBe(true);
    expect(bad.vision).toBeUndefined();
    expect(bad.report).toContain('No CPU setting produced correct text');
    expect(bad.report).toContain('No GPU setting');
    mockLoad.mockRejectedValue(new Error('out of memory'));
    const thrown = await diag.runModelSweep({ ...model, mmProjPath: undefined, draftPath: undefined }, { layers: [8] });
    expect(thrown.steps.every((s: any) => /out of memory/.test(s.error))).toBe(true);
    mockLoad.mockResolvedValue(undefined);
  });

  it('stops between steps when asked, and reports a picture that is wrong or cannot be seen', async () => {
    const { diag, model } = load();
    let n = 0;
    const stopped = await diag.runModelSweep(model, { layers: [8], shouldStop: () => ++n > 2 });
    expect(stopped.steps.length).toBe(2);
    expect(stopped.vision).toBeUndefined();
    mockState.reply = 'blue';
    const wrong = await diag.runModelSweep(model, { layers: [8] });
    expect(wrong.vision).toMatchObject({ ok: false, error: expect.stringMatching(/did not name the colour/) });
    mockState.vision = false;
    const blind = await diag.runModelSweep(model, { layers: [8] });
    expect(blind.vision?.error).toMatch(/cannot see pictures/);
    mockState.vision = true;
    mockLoad.mockImplementation(async (_p: unknown, projector: unknown) => { if (projector) throw new Error('projector failed'); });
    const noProjector = await diag.runModelSweep(model, { layers: [8] });
    expect(noProjector.vision?.error).toBe('projector failed');
    mockLoad.mockResolvedValue(undefined);
  });

  it('checks a published checksum the person gave, and tolerates a missing model file', async () => {
    const { diag, model } = load();
    const withSum = await diag.runModelSweep(model, { layers: [8], expected: 'a'.repeat(64) });
    expect(withSum.files[0]).toMatch(/Model file/);
    const missing = await diag.runModelSweep({ ...model, filePath: '/models/gone.gguf' }, { layers: [8] });
    expect(missing.files[0]).toMatch(/could not be read/);
  });
});
