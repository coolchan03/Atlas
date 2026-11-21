/**
 * Load guard: a native crash during a model load must be remembered across launches, and the same
 * configuration must then load more carefully instead of crashing again.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  recoverFromPreviousRun, enterStage, leaveStage, recordLoadSuccess, recordLoadFailure, planLoad,
  isQuarantined, describeLoadHealth, clearCrashHistory, loadSignature, __resetLoadGuardForTests,
} from '../../../src/services/loadGuard';

const KEY = '@atlas/loadGuard.v1';
const store: Record<string, string> = {};
const cfg = { modelPath: '/m/gemma.gguf', backend: 'opencl', mtp: true, vision: true };

/** Simulate a new process: memory is wiped, the saved copy stays. */
function relaunch(): void { __resetLoadGuardForTests(); }

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (k: string) => store[k] ?? null);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (k: string, v: string) => { store[k] = v; });
  __resetLoadGuardForTests();
});

describe('loadGuard', () => {
  it('writes the breadcrumb to storage before the native step runs', async () => {
    await enterStage({ ...cfg, stage: 'init', contextLength: 4096 });
    expect(JSON.parse(store[KEY]).inFlight).toMatchObject({ stage: 'init', backend: 'opencl', contextLength: 4096 });
  });

  it('clears the breadcrumb when the step ends, so a normal exit is not a crash', async () => {
    await enterStage({ ...cfg, stage: 'init' });
    await leaveStage();
    relaunch();
    expect(await recoverFromPreviousRun()).toBeNull();
    expect(isQuarantined(cfg)).toBe(false);
  });

  it('turns a breadcrumb left by a dead process into a crash record on the next launch', async () => {
    await enterStage({ ...cfg, stage: 'vision' });
    relaunch(); // the process died here
    const crash = await recoverFromPreviousRun();
    expect(crash).toMatchObject({ stage: 'vision', count: 1, signature: loadSignature(cfg) });
    expect(isQuarantined(cfg)).toBe(true);
    expect(JSON.parse(store[KEY]).inFlight).toBeNull(); // consumed once, not re-counted on the launch after
    relaunch();
    expect(await recoverFromPreviousRun()).toBeNull();
    expect(isQuarantined(cfg)).toBe(true);
  });

  it('counts repeated crashes of the same configuration', async () => {
    for (let i = 0; i < 2; i++) { await enterStage({ ...cfg, stage: 'init' }); relaunch(); await recoverFromPreviousRun(); }
    expect(describeLoadHealth().crashes[0].count).toBe(2);
  });

  it('a successful load of the configuration lifts the suspicion', async () => {
    await enterStage({ ...cfg, stage: 'init' }); relaunch(); await recoverFromPreviousRun();
    await recordLoadSuccess(cfg);
    expect(isQuarantined(cfg)).toBe(false);
  });

  it('survives unreadable saved data without throwing', async () => {
    store[KEY] = '{not json';
    expect(await recoverFromPreviousRun()).toBeNull();
    expect(isQuarantined(cfg)).toBe(false);
  });

  it('forgets a crash after it has aged out', async () => {
    await enterStage({ ...cfg, stage: 'init' }); relaunch();
    await recoverFromPreviousRun(Date.now() - 15 * 24 * 60 * 60 * 1000);
    relaunch();
    await recoverFromPreviousRun();
    expect(isQuarantined(cfg)).toBe(false);
  });

  describe('planLoad', () => {
    const opts = { explicitBackend: false, cpuBackend: 'cpu' };
    it('leaves a healthy configuration exactly as requested', async () => {
      await recoverFromPreviousRun();
      expect(planLoad(cfg, opts)).toMatchObject({ backend: 'opencl', mtp: true, vision: true, blocked: false, notes: [] });
    });

    it('drops MTP and pictures first, keeping the accelerator', async () => {
      await enterStage({ ...cfg, stage: 'vision' }); relaunch(); await recoverFromPreviousRun();
      const plan = planLoad(cfg, opts);
      expect(plan).toMatchObject({ backend: 'opencl', mtp: false, vision: false, blocked: false });
      expect(plan.notes[0]).toMatch(/MTP drafting and the picture file/);
      expect(plan.notes[0]).toMatch(/untouched/);
    });

    it('moves to the CPU when the lean accelerated load also crashed (Auto)', async () => {
      await enterStage({ ...cfg, stage: 'init' }); relaunch(); await recoverFromPreviousRun();
      await enterStage({ ...cfg, mtp: false, vision: false, stage: 'init' }); relaunch(); await recoverFromPreviousRun();
      const plan = planLoad(cfg, opts);
      expect(plan).toMatchObject({ backend: 'cpu', mtp: false, vision: false, blocked: false });
      expect(plan.notes[0]).toMatch(/uses the CPU/);
    });

    it('never swaps an explicitly chosen accelerator silently', async () => {
      const lean = { ...cfg, mtp: false, vision: false };
      await enterStage({ ...lean, stage: 'init' }); relaunch(); await recoverFromPreviousRun();
      const plan = planLoad(lean, { explicitBackend: true, cpuBackend: 'cpu' });
      expect(plan.blocked).toBe(true);
      expect(plan.backend).toBe('opencl');
      expect(plan.notes[0]).toMatch(/Safe Model Loading/);
    });

    it('refuses an exact file that crashes even on the bare CPU', async () => {
      const bare = { modelPath: cfg.modelPath, backend: 'cpu', mtp: false, vision: false };
      await enterStage({ ...bare, stage: 'init' }); relaunch(); await recoverFromPreviousRun();
      const plan = planLoad(bare, opts);
      expect(plan.blocked).toBe(true);
      expect(plan.notes[0]).toMatch(/damaged or unsupported/);
    });

    it("one model's crash does not affect another model", async () => {
      await enterStage({ ...cfg, stage: 'init' }); relaunch(); await recoverFromPreviousRun();
      expect(planLoad({ ...cfg, modelPath: '/m/other.gguf' }, opts).notes).toEqual([]);
    });
  });

  it('keeps the failing operation and the native message for a failure JS could see', async () => {
    await recordLoadFailure({ ...cfg, stage: 'init', message: 'Failed to load model', nativeTail: 'error: missing tensor blk.0' });
    relaunch();
    await recoverFromPreviousRun();
    const { lastFailure, summary } = describeLoadHealth();
    expect(lastFailure).toMatchObject({ stage: 'init', nativeTail: 'error: missing tensor blk.0' });
    expect(summary).toMatch(/starting the model/);
  });

  it('forget crash history releases the quarantine and keeps nothing in flight', async () => {
    await enterStage({ ...cfg, stage: 'init' }); relaunch(); await recoverFromPreviousRun();
    await clearCrashHistory();
    expect(isQuarantined(cfg)).toBe(false);
    relaunch();
    await recoverFromPreviousRun();
    expect(isQuarantined(cfg)).toBe(false);
  });
});

describe('loadGuard with the system exit record (Android 11 and up)', () => {
  const { NativeModules } = require('react-native');
  const exitsOf = (reason: string, at: number, description = '') => ({ supported: true, reasons: [{ at, reason, description, rssKb: 3_000_000 }] });
  const withExit = (info: unknown) => { NativeModules.DeviceMemoryModule = { getLastExitReasons: jest.fn(async () => info) }; };
  afterEach(() => { delete NativeModules.DeviceMemoryModule; });

  it('does not call a load a crash when the person closed the app during it', async () => {
    await enterStage({ ...cfg, stage: 'init' });
    withExit(exitsOf('USER_REQUESTED', Date.now() + 1000));
    relaunch();
    expect(await recoverFromPreviousRun()).toBeNull();
    expect(isQuarantined(cfg)).toBe(false);
    expect(JSON.parse(store[KEY]).inFlight).toBeNull(); // and the breadcrumb does not come back at the next launch
  });

  it('does not trust "the app closed itself" as harmless: a native library calling exit() during a load looks the same', async () => {
    await enterStage({ ...cfg, stage: 'init' });
    withExit(exitsOf('EXIT_SELF', Date.now() + 1000));
    relaunch();
    expect((await recoverFromPreviousRun())?.stage).toBe('init');
    expect(isQuarantined(cfg)).toBe(true); // recorded as a crash, so the next load of this exact setup steps down
  });

  it('records a crash with what the system said, so the summary can name it', async () => {
    await enterStage({ ...cfg, stage: 'init' });
    withExit(exitsOf('LOW_MEMORY', Date.now() + 1000));
    relaunch();
    const crash = await recoverFromPreviousRun();
    expect(crash?.exitReason).toMatch(/ran out of memory/);
    expect(describeLoadHealth().summary).toMatch(/system says Android closed Atlas because the phone ran out of memory/);
  });

  it('ignores an exit record from before the load began, and a phone that keeps none', async () => {
    await enterStage({ ...cfg, stage: 'init' });
    withExit(exitsOf('USER_REQUESTED', Date.now() - 3_600_000));
    relaunch();
    expect((await recoverFromPreviousRun())?.stage).toBe('init');
    await clearCrashHistory();
    await enterStage({ ...cfg, stage: 'init' });
    withExit({ supported: false, reasons: [] });
    relaunch();
    expect((await recoverFromPreviousRun())?.exitReason).toBeUndefined();
  });
});
