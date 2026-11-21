/**
 * Load guard: survives a native crash during a model load.
 *
 * A native abort (SIGSEGV in a GPU driver, an out-of-memory kill by Android) takes the whole process down, so
 * nothing in JS can catch it. What can be done is to write a breadcrumb BEFORE each dangerous native step and
 * remove it when the step is over. If the next launch finds a breadcrumb still there, the process died during
 * that step: the exact configuration (model + accelerator + MTP + vision) is remembered as a crash, and the
 * next load of the same configuration steps down to a safer one instead of crashing again.
 *
 * Nothing here deletes a model, an attachment or a setting. It only records what happened and decides how much
 * optional machinery (picture file, MTP drafting, GPU/NPU) to switch on for the next load.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import logger from '../utils/logger';
import { __resetExitReasonsForTests, explainExit, isBenignExit, noteLastExit } from './exitReasons';

const STORAGE_KEY = '@atlas/loadGuard.v1';
/** A crash is forgotten after this long, so a fixed driver or a freed-up phone gets another chance. */
const CRASH_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_CRASH_RECORDS = 40;
const MAX_FAILURES = 12;

export type LoadStage = 'check' | 'init' | 'draft' | 'vision' | 'output-check' | 'vulkan';

const STAGE_LABEL: Record<LoadStage, string> = {
  check: 'checking the file',
  init: 'starting the model',
  draft: 'starting the MTP draft file',
  vision: 'starting the picture (vision) file',
  'output-check': 'testing the first reply',
  vulkan: 'starting the Vulkan GPU engine',
};

/** The parts of a load that can change whether it crashes. Context length is NOT part of it (shrinking it is a remedy). */
export interface LoadConfig {
  modelPath: string;
  backend: string;
  mtp: boolean;
  vision: boolean;
}

interface Breadcrumb extends LoadConfig {
  startedAt: number;
  stage: LoadStage;
  contextLength?: number;
  gpuLayers?: number;
}

export interface CrashRecord extends LoadConfig {
  signature: string;
  stage: LoadStage;
  count: number;
  lastAt: number;
  contextLength?: number;
  gpuLayers?: number;
  /** What the operating system said ended that run, when it said (Android 11 and up). */
  exitReason?: string;
}

/** A load that failed in a way JS could see (not a crash). Kept so the failing operation can be explained later. */
export interface FailureRecord extends LoadConfig {
  stage: LoadStage;
  at: number;
  message: string;
  /** The last lines llama.cpp itself printed, when it printed any. */
  nativeTail?: string;
}

interface GuardState {
  inFlight: Breadcrumb | null;
  crashes: Record<string, CrashRecord>;
  failures: FailureRecord[];
}

let state: GuardState = { inFlight: null, crashes: {}, failures: [] };
let loaded: Promise<void> | null = null;
let recovered: CrashRecord | null = null;
let writeChain: Promise<void> = Promise.resolve();

export function loadSignature(c: LoadConfig): string {
  return `${c.modelPath}|${c.backend}|mtp:${c.mtp ? 1 : 0}|vision:${c.vision ? 1 : 0}`;
}

function persist(): Promise<void> {
  // Serialized so two quick breadcrumbs cannot land out of order; the caller awaits it before the native call.
  const snapshot = JSON.stringify(state);
  writeChain = writeChain.then(() => AsyncStorage.setItem(STORAGE_KEY, snapshot)).catch((e) => {
    logger.warn('[LOAD-GUARD] could not save the load record:', e);
  });
  return writeChain;
}

function prune(now: number): void {
  const entries = Object.values(state.crashes).filter((c) => now - c.lastAt < CRASH_TTL_MS)
    .sort((a, b) => b.lastAt - a.lastAt).slice(0, MAX_CRASH_RECORDS);
  state.crashes = Object.fromEntries(entries.map((c) => [c.signature, c]));
  state.failures = state.failures.slice(-MAX_FAILURES);
}

/**
 * Read the saved record once per process. If the previous process left a breadcrumb, it died mid-load:
 * turn it into a crash record. Safe to call from anywhere, any number of times.
 */
export function recoverFromPreviousRun(now: number = Date.now()): Promise<CrashRecord | null> {
  if (!loaded) {
    loaded = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<GuardState>;
          state = { inFlight: parsed.inFlight ?? null, crashes: parsed.crashes ?? {}, failures: parsed.failures ?? [] };
        }
      } catch (e) {
        logger.warn('[LOAD-GUARD] the saved load record was unreadable and was reset:', e);
        state = { inFlight: null, crashes: {}, failures: [] };
      }
      let crumb = state.inFlight;
      let exitNote: string | undefined;
      if (crumb) {
        // The system's own record of how that run ended. A load cut short because the person closed the app says nothing about the model, so it
        // is not recorded as a crash (and the next load is not made more careful for it). No record, or one from before the load began: as before.
        const exit = await noteLastExit().catch(() => null);
        if (exit && exit.at >= crumb.startedAt) {
          if (isBenignExit(exit)) {
            logger.log(`[LOAD-GUARD] the previous run ended during ${STAGE_LABEL[crumb.stage]}, but ${explainExit(exit)}: not recorded as a crash`);
            state.inFlight = null;
            crumb = null;
            await persist();
          } else exitNote = explainExit(exit);
        }
      }
      if (crumb) {
        const signature = loadSignature(crumb);
        const prev = state.crashes[signature];
        recovered = {
          modelPath: crumb.modelPath, backend: crumb.backend, mtp: crumb.mtp, vision: crumb.vision, signature,
          stage: crumb.stage, count: (prev?.count ?? 0) + 1, lastAt: now,
          contextLength: crumb.contextLength, gpuLayers: crumb.gpuLayers, exitReason: exitNote,
        };
        state.crashes[signature] = recovered;
        state.inFlight = null;
        logger.error(`[LOAD-GUARD] the previous run ended while ${STAGE_LABEL[crumb.stage]} (${crumb.backend}, MTP ${crumb.mtp ? 'on' : 'off'}, pictures ${crumb.vision ? 'on' : 'off'}): recorded as a crash${exitNote ? `; the system says ${exitNote}` : ''}`);
      }
      prune(now);
      if (crumb) await persist();
    })();
  }
  return loaded.then(() => recovered);
}

/** Write the breadcrumb and WAIT until it is saved: call this immediately before a native step. */
export async function enterStage(config: LoadConfig & { stage: LoadStage; contextLength?: number; gpuLayers?: number }): Promise<void> {
  await recoverFromPreviousRun();
  state.inFlight = { ...config, startedAt: Date.now() };
  await persist();
}

/** The native step finished (or failed in a way JS saw): remove the breadcrumb. */
export async function leaveStage(): Promise<void> {
  await recoverFromPreviousRun();
  if (!state.inFlight) return;
  state.inFlight = null;
  await persist();
}

/** The whole configuration loaded: it is no longer suspected. */
export async function recordLoadSuccess(config: LoadConfig): Promise<void> {
  await recoverFromPreviousRun();
  state.inFlight = null;
  delete state.crashes[loadSignature(config)];
  await persist();
}

/** A load failed with an error JS could read. Keep the failing operation and any native message. */
export async function recordLoadFailure(failure: Omit<FailureRecord, 'at'>): Promise<void> {
  await recoverFromPreviousRun();
  state.inFlight = null;
  state.failures.push({ ...failure, message: failure.message.slice(0, 400), at: Date.now() });
  prune(Date.now());
  await persist();
}

export function isQuarantined(config: LoadConfig): boolean {
  const record = state.crashes[loadSignature(config)];
  return !!record && Date.now() - record.lastAt < CRASH_TTL_MS;
}

export interface LoadPlan {
  backend: string;
  mtp: boolean;
  vision: boolean;
  /** True when nothing safer than the requested configuration is left and that one has crashed before. */
  blocked: boolean;
  /** Plain-language notes on what was switched off and why, for the UI and the report. */
  notes: string[];
}

/**
 * Pick how much to switch on. Steps, each only taken while the one before has crashed this phone:
 *   as requested  →  same accelerator without MTP/pictures  →  CPU without MTP/pictures.
 * An accelerator the user chose explicitly is never swapped silently: that case is `blocked` so the caller can say so.
 */
export function planLoad(requested: LoadConfig, opts: { explicitBackend: boolean; cpuBackend: string }): LoadPlan {
  const notes: string[] = [];
  const { cpuBackend } = opts;
  if (!isQuarantined(requested)) return { backend: requested.backend, mtp: requested.mtp, vision: requested.vision, blocked: false, notes };

  const crash = state.crashes[loadSignature(requested)];
  const why = `Atlas closed while ${STAGE_LABEL[crash.stage]} last time`;
  const optional = requested.mtp || requested.vision;
  const dropped = [requested.mtp ? 'MTP drafting' : '', requested.vision ? 'the picture file' : ''].filter(Boolean).join(' and ');

  if (optional) {
    const lean = { ...requested, mtp: false, vision: false };
    if (!isQuarantined(lean)) {
      notes.push(`${why}, so this load leaves out ${dropped}. Your files and settings are untouched. To try them again, use Settings → Safe Model Loading → Forget crash history.`);
      return { backend: lean.backend, mtp: false, vision: false, blocked: false, notes };
    }
  }
  if (requested.backend !== cpuBackend) {
    const cpu = { ...requested, backend: cpuBackend, mtp: false, vision: false };
    if (!opts.explicitBackend && !isQuarantined(cpu)) {
      notes.push(`${why} on the ${requested.backend.toUpperCase()}, so this load uses the CPU${optional ? ` without ${dropped}` : ''}.`);
      return { backend: cpuBackend, mtp: false, vision: false, blocked: false, notes };
    }
    notes.push(`${why} on the ${requested.backend.toUpperCase()}. Choose Automatic or CPU for this model, or turn on Safe Model Loading, then try again.`);
    return { backend: requested.backend, mtp: false, vision: false, blocked: true, notes };
  }
  notes.push(`${why} even on the CPU with nothing extra switched on, so Atlas will not try this exact file again automatically. The file may be damaged or unsupported by this build. Re-download it, or choose another model. You can retry from Settings → Safe Model Loading → Forget crash history.`);
  return { backend: requested.backend, mtp: false, vision: false, blocked: true, notes };
}

/** Everything a settings screen needs to explain the situation without showing raw logs. */
export function describeLoadHealth(): { crashes: CrashRecord[]; lastFailure: FailureRecord | null; summary: string } {
  const crashes = Object.values(state.crashes).sort((a, b) => b.lastAt - a.lastAt);
  const lastFailure = state.failures.length ? state.failures[state.failures.length - 1] : null;
  const name = (p: string): string => p.split('/').pop() ?? p;
  let summary = 'No model load has crashed Atlas recently.';
  if (crashes.length) {
    const c = crashes[0];
    summary = `Atlas closed while ${STAGE_LABEL[c.stage]} for ${name(c.modelPath)} (${c.backend}${c.mtp ? ', MTP' : ''}${c.vision ? ', pictures' : ''}). That setup is now loaded more carefully.${c.exitReason ? ` The system says ${c.exitReason}.` : ''}`;
  } else if (lastFailure) {
    summary = `The last load of ${name(lastFailure.modelPath)} failed while ${STAGE_LABEL[lastFailure.stage]}: ${lastFailure.message}`;
  }
  return { crashes, lastFailure, summary };
}

/** Forget remembered crashes (the user's way back after fixing a file or updating the app). */
export async function clearCrashHistory(): Promise<void> {
  await recoverFromPreviousRun();
  state.crashes = {};
  state.inFlight = null;
  await persist();
}

/** Test seam: forget everything held in memory (not the saved copy) so the next call re-reads storage. */
export function __resetLoadGuardForTests(): void {
  state = { inFlight: null, crashes: {}, failures: [] };
  loaded = null;
  recovered = null;
  __resetExitReasonsForTests();
  writeChain = Promise.resolve();
}
