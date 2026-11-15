/**
 * The self-check: tries each thing the app depends on for studying, on this phone, and reports pass, fail or skipped with the reason.
 * A check that throws or takes too long is a fail with that reason, so one broken piece cannot hide the rest. The checks are plain
 * functions, so the runner is tested without a phone and the screen only shows results.
 */
export type CheckStatus = 'pass' | 'fail' | 'skip';
export interface CheckOutcome { status: CheckStatus; detail: string }
export interface Check { id: string; name: string; run: () => Promise<CheckOutcome>; /** For a check that loads a model, which can take a minute on a slow phone. */ timeoutMs?: number }
export interface CheckResult extends CheckOutcome { id: string; name: string; ms: number }

/** The longest one check may take. */
export const CHECK_TIMEOUT_MS = 25_000;

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> => new Promise<T>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no answer after ${Math.round(ms / 1000)} seconds`)), ms);
  p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
});

/** Runs the checks one after another (so they do not compete for the phone), reporting each as it finishes. */
export async function runChecks(checks: Check[], onResult?: (r: CheckResult) => void, timeoutMs = CHECK_TIMEOUT_MS): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  for (const c of checks) {
    const started = Date.now();
    let outcome: CheckOutcome;
    try { outcome = await withTimeout(c.run(), c.timeoutMs ?? timeoutMs); } catch (e) { outcome = { status: 'fail', detail: String((e as Error)?.message || e).slice(0, 200) }; }
    const result = { id: c.id, name: c.name, ms: Date.now() - started, ...outcome };
    out.push(result);
    onResult?.(result);
  }
  return out;
}

export const summarize = (results: CheckResult[]): string => {
  const fail = results.filter((r) => r.status === 'fail').length;
  const pass = results.filter((r) => r.status === 'pass').length;
  const skip = results.filter((r) => r.status === 'skip').length;
  return fail ? `${fail} failed, ${pass} passed${skip ? `, ${skip} skipped` : ''}.` : `All good: ${pass} passed${skip ? `, ${skip} skipped (not available on this phone or switched off)` : ''}.`;
};

const pass = (detail: string): CheckOutcome => ({ status: 'pass', detail });
const fail = (detail: string): CheckOutcome => ({ status: 'fail', detail });
const skip = (detail: string): CheckOutcome => ({ status: 'skip', detail });

/** The checks the app runs, for a project (the library search is tried on it). */
export function defaultChecks(projectId?: string): Check[] {
  return [
    { id: 'model', name: 'The phone\'s model', run: async () => {
      const { llmService } = require('../services/llm');
      return llmService.isModelLoaded() ? pass('A model is loaded and ready.') : skip('No model is loaded right now. It loads when you start a chat or a lesson.');
    } },
    { id: 'server', name: 'The server model', run: async () => {
      const { remoteActive, askRemote } = require('../study/remoteAsk');
      if (!remoteActive()) return skip('No server model is chosen, so lessons are written by the phone\'s model.');
      const reply: string | null = await askRemote('Reply with the single word OK.', 'OK');
      return reply ? pass(`The server answered: "${reply.slice(0, 40)}".`) : fail('The server did not answer, so lessons fall back to the phone\'s model.');
    } },
    { id: 'embedding', name: 'The search model', timeoutMs: 120_000, run: async () => {
      const { embeddingService } = require('../services/rag/embedding');
      if (!embeddingService.isLoaded()) await embeddingService.load();
      const v: number[] = await embeddingService.embed('lease accounting');
      return v?.length ? pass(`Works (${v.length} numbers per passage).`) : fail('It returned nothing, so searching your documents will not work.');
    } },
    { id: 'library', name: 'Search your documents', run: async () => {
      if (!projectId) return skip('No project to search. Open a project or exam folder and run this again.');
      const { ragService } = require('../services/rag');
      const stats = await ragService.libraryStats(projectId);
      if (stats === null) return skip('This project is protected, so its documents cannot be searched from here. Unlock it and check from inside it.');
      if (!stats.documents.length) return skip('This project has no documents yet.');
      const t = Date.now();
      const r = await ragService.searchProject(projectId, 'the', { topK: 3 });
      const chunks = stats.documents.reduce((n: number, d: { chunks: number }) => n + d.chunks, 0);
      return r?.chunks?.length ? pass(`${stats.documents.length} documents, ${chunks.toLocaleString('en-US')} passages; a search took ${Date.now() - t} ms.`) : fail('The search found nothing in a project that has documents.');
    } },
    { id: 'vision', name: 'Reading scanned pages', run: async () => {
      const { canReadScans } = require('../services/rag/pageChunks');
      return canReadScans() ? pass('A model that can see images is loaded, so scanned pages can be read.') : skip('No vision model is loaded. Scanned PDFs need one (load it, then add the file).');
    } },
    { id: 'web', name: 'Looking things up online', run: async () => {
      const { appSearch } = require('../topics/verifyLines');
      const search = appSearch();
      if (!search) return skip('Off-grid mode is on, so nothing is looked up online.');
      const hits = await search('FASB accounting standards update');
      return hits.length ? pass(`The search works (${hits.length} results).`) : fail('The search returned nothing: no internet, or the search service refused.');
    } },
    { id: 'speech', name: 'The reading voice', run: async () => {
      const { ttsAvailable } = require('../atlasVoice/tts');
      return ttsAvailable() ? pass('The voice engine is there, so lessons can be read aloud.') : skip('The voice engine is not available on this phone.');
    } },
    { id: 'controls', name: 'Lock-screen controls', run: async () => {
      const { NativeModules, PermissionsAndroid, Platform } = require('react-native');
      const native = NativeModules.AtlasMediaControls;
      if (!native?.show) return skip('This build has no lock-screen controls for this phone.');
      // The test notification would replace the one a reading is using.
      if (require('../atlasVoice/readAloud').readAloud.useReader.getState().status !== 'idle') return skip('Read aloud is in use right now. Stop it and run this again.');
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        const ok = await PermissionsAndroid.check('android.permission.POST_NOTIFICATIONS');
        if (!ok) return fail('Notifications are not allowed for Atlas, so the controls cannot show. Allow them in the phone\'s app settings.');
      }
      native.show('Self-check', 'Testing the lock-screen controls', true);
      await new Promise((r) => setTimeout(r, 1500));
      native.hide();
      return pass('A test notification was shown for a moment. If you saw it with play and pause, it works.');
    } },
    { id: 'storage', name: 'Free space', run: async () => {
      const RNFS = require('react-native-fs').default;
      const info = await RNFS.getFSInfo();
      const gb = info.freeSpace / 1024 ** 3;
      return gb >= 1 ? pass(`${gb.toFixed(1)} GB free.`) : fail(`Only ${gb.toFixed(1)} GB free: adding books and models may fail.`);
    } },
  ];
}
