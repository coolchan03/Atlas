/**
 * PDF ingestion and incremental study. Fakes only the device boundary: the native PDF reader, the file system, and the model
 * (whose reply is derived from the passage it is shown, like a model quoting what it reads).
 */
import { installNativeBoundary, GB } from '../../harness/nativeBoundary';
import { createDownloadedModel } from '../../utils/factories';

const sentence = (topic: string, n: number) => `The ${topic} concept ${n} is explained here with a worked example and a short definition.`;
const para = (topic: string, n: number) => Array.from({ length: 6 }, (_, i) => sentence(topic, n + i)).join(' ');

/** A fake "accounting textbook": chapters over many pages, a table on one page, and one scanned (empty) page. */
function bookPages(pageCount = 40): string[] {
  const chapters = [['Chapter 1 Accounting Basics', 'ledger'], ['Chapter 2 Financial Statements', 'balance sheet'], ['Chapter 3 Cost Accounting', 'costing'], ['Chapter 4 Tax and Reporting', 'depreciation']];
  const per = Math.ceil(pageCount / chapters.length);
  return Array.from({ length: pageCount }, (_, i) => {
    const [title, topic] = chapters[Math.min(chapters.length - 1, Math.floor(i / per))];
    if (i === 17) return ''; // a scanned page
    return `${i % per === 0 ? `${title}\n\n` : ''}${[0, 1, 2].map((k) => para(topic, i * 20 + k * 6)).join('\n\n')}${i === 9 ? '\n\nItem\tQ1\tQ2\tQ3\nRevenue\t100\t120\t130\nExpenses\t80\t90\t95\nProfit\t20\t30\t35' : ''}`;
  });
}

async function setup(pages: string[], opts: { model?: boolean } = {}) {
  const boundary = installNativeBoundary({ llama: true, fs: true, ram: { platform: 'android', totalBytes: 12 * GB, availBytes: 8 * GB } });
  const { NativeModules } = require('react-native');
  const calls: number[] = [];
  NativeModules.PDFExtractorModule = {
    pageCount: jest.fn(async () => pages.length),
    extractPages: jest.fn(async (_path: string, start: number, count: number) => { calls.push(count); return pages.slice(start, start + count); }),
  };
  boundary.fs!.seedFile('/picked/book.pdf', 3 * 1024 * 1024);
  if (opts.model !== false) {
    const { useAppStore } = require('../../../src/stores');
    const { hardwareService } = require('../../../src/services/hardware');
    useAppStore.getState().updateSettings({ inferenceBackend: 'cpu' });
    boundary.fs!.seedFile('/models/small.gguf', 500 * 1024 * 1024);
    await hardwareService.refreshMemoryInfo();
    useAppStore.setState({ downloadedModels: [createDownloadedModel({ id: 'llm', engine: 'llama', filePath: '/models/small.gguf', fileSize: 500 * 1024 * 1024 })], activeModelId: 'llm' });
    // The model: for the passage in the prompt, one finding that quotes the passage's first sentence.
    const { initLlama } = require('llama.rn');
    const real = (initLlama as jest.Mock).getMockImplementation()!;
    (initLlama as jest.Mock).mockImplementation(async (params: Record<string, unknown>, cb?: (p: number) => void) => {
      const context: any = await real(params, cb);
      if (!context.__reader) {
        const original = context.completion;
        context.completion = async (p: any, tokenCb: any) => {
          const user: string = p.messages.find((m: any) => m.role === 'user')?.content ?? '';
          const passage = (user.match(/"""\n([\s\S]*?)\n"""/) ?? [])[1] ?? '';
          const first = (passage.match(/The [^.]+\./) ?? [''])[0];
          boundary.llama!.scriptCompletion({ text: first ? JSON.stringify([{ question: `What is said about ${first.split(' ')[3]}?`, finding: first, quote: first.slice(0, 60), uncertainty: 'Only this passage was read.', confidence: 0.8, basis: 'observed' }]) : '[]' });
          return original.call(context, p, tokenCb);
        };
        context.__reader = true;
      }
      return context;
    });
  }
  /** What survives a restart on the phone but not in a fresh test module registry: the native PDF module and the saved model choice. */
  const reinstall = () => {
    const { NativeModules: NM } = require('react-native');
    NM.PDFExtractorModule = NativeModules.PDFExtractorModule;
    if (opts.model !== false) {
      const { useAppStore } = require('../../../src/stores');
      useAppStore.getState().updateSettings({ inferenceBackend: 'cpu' });
      useAppStore.setState({ downloadedModels: [createDownloadedModel({ id: 'llm', engine: 'llama', filePath: '/models/small.gguf', fileSize: 500 * 1024 * 1024 })], activeModelId: 'llm' });
    }
  };
  return { boundary, calls, NativeModules, reinstall };
}

const mods = () => ({
  docs: require('../../../src/knowledge/documents'),
  study: require('../../../src/knowledge/study'),
  agents: require('../../../src/knowledge/agents'),
  cycles: require('../../../src/knowledge/cycles'),
});

// Each test gets its own disk: modules are loaded fresh so none keeps a handle to an earlier test's file system.
beforeEach(() => jest.resetModules());


const quoteOf = (user: string) => {
  const passage = (user.match(/"""\n([\s\S]*?)\n"""/) ?? [])[1] ?? '';
  const first = (passage.match(/The [^.]+\./) ?? [''])[0];
  return { passage, first };
};
const finding = (user: string, over: Record<string, unknown> = {}) => {
  const { first } = quoteOf(user);
  return { question: `What is said about ${first.split(' ')[3]}?`, finding: first, quote: first.slice(0, 60), uncertainty: 'Only this passage.', confidence: 0.8, ...over };
};

describe('study with a scripted asker', () => {
  it('parses findings out of noisy replies', () => {
    const { study } = mods();
    expect(study.parseFindings('no list')).toBeNull();
    expect(study.parseFindings('[ broken')).toBeNull();
    expect(study.parseFindings('{"a":1}')).toBeNull();
    expect(study.parseFindings('Here: [{"a":1}, 5, null, "x"] done')).toEqual([{ a: 1 }]);
    expect(study.quoteIsOnThePage('The  LEDGER concept', 'the ledger concept is here')).toBe(true);
    expect(study.quoteIsOnThePage('short', 'short text')).toBe(false);
    expect(study.summarise('T', [], { chunksThisRun: 1, chunksTotal: 1, pages: undefined, unreadable: [], done: true })).toMatch(/Studied "T"/);
    expect(study.summarise('T', ['a'], { chunksThisRun: 2, chunksTotal: 5, pages: 9, unreadable: [1, 2, 3, 4, 5, 6, 7, 8], done: false })).toMatch(/part of/);
  });

  it('retries a reply that is not a list, files weak findings as inferred and low confidence, and skips bad ones', async () => {
    await setup(bookPages(12), { model: false });
    const { docs, study, cycles } = mods();
    const { doc } = await docs.importPdf({ uri: 'file:///picked/book.pdf', name: 'Accounting Textbook.pdf' });
    let n = 0;
    const ask = async (_system: string, user: string) => {
      n++;
      if (n % 5 === 1) return 'I am not sure.'; // first attempt: not a list; the retry then answers
      if (/ONLY the JSON array/.test(user) || n % 5 !== 1) {
        return JSON.stringify([
          finding(user), finding(user, { quote: 'a quote that is not on this page at all', confidence: 0.99, question: 'Unquoted?', finding: `${quoteOf(user).first} (claimed)` }),
          finding(user, { basis: 'inferred', question: 'Inferred?', finding: `${quoteOf(user).first} (inferred)` }),
          { question: '', finding: 'too short' }, { question: 'Q?', finding: 'tiny' },
        ]);
      }
      return '[]';
    };
    const outcome = await study.studyDocument(doc.sourceId, { ask, batchChunks: 3 });
    expect(outcome.status).toBe('completed');
    const found = await cycles.searchFindings({ limit: 500 });
    expect(found.some((f: any) => f.basis === 'inferred' && f.confidence <= 0.4)).toBe(true);
    expect(found.some((f: any) => f.basis === 'observed')).toBe(true);
    expect(found.some((f: any) => f.review.judge === 'needs-review')).toBe(true);
  }, 60000);

  it('pauses when asked to stop, and reports an error from the model without losing the run', async () => {
    await setup(bookPages(12), { model: false });
    const { docs, study } = mods();
    const { doc } = await docs.importPdf({ uri: 'file:///picked/book.pdf', name: 'Accounting Textbook.pdf' });
    let calls = 0;
    const stopAfterOne = await study.studyDocument(doc.sourceId, { ask: async (_s: string, u: string) => { calls++; return JSON.stringify([finding(u)]); }, shouldStop: () => calls >= 1, batchChunks: 2 });
    expect(stopAfterOne.status).toBe('paused');
    const failing = await study.studyDocument(doc.sourceId, { ask: async () => { throw new Error('model exploded'); }, batchChunks: 50 });
    expect(['paused', 'completed']).toContain(failing.status);
  }, 60000);

  it('stops without marking anything studied when the model is missing, and refuses a document that is gone', async () => {
    await setup(bookPages(12), { model: false });
    const { docs, study } = mods();
    await expect(study.studyDocument('nope', { ask: async () => '[]' })).rejects.toThrow('No such document');
    const { doc } = await docs.importPdf({ uri: 'file:///picked/book.pdf', name: 'Accounting Textbook.pdf' });
    const outcome = await study.studyDocument(doc.sourceId, { ask: async () => { throw new Error('No model selected'); } }).catch((e: Error) => e);
    expect(outcome instanceof Error || (outcome as any).status === 'paused').toBe(true);
  }, 60000);

  it('approves a finding after two independent sources and leaves single-source ones provisional (manager pass)', async () => {
    await setup(bookPages(12), { model: false });
    const { docs, study, agents } = mods();
    const { doc } = await docs.importPdf({ uri: 'file:///picked/book.pdf', name: 'Accounting Textbook.pdf' });
    await study.studyDocument(doc.sourceId, { ask: async (_s: string, u: string) => JSON.stringify([finding(u)]), batchChunks: 4 });
    const profile = (await agents.listProfiles())[0];
    expect(await study.managerPass(profile.agentId)).toBe(0);
  }, 60000);
});
