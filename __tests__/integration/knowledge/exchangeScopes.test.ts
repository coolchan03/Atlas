/**
 * Export / import between two devices: each "device" is its own disk. Only the device boundary is faked
 * (file system, zip, the native PDF reader).
 */
import { installNativeBoundary } from '../../harness/nativeBoundary';

const HASH_A = '1'.repeat(64);
const HASH_B = '2'.repeat(64);
const ev = (hash: string, chunk: string, page: number) => ({ sourceId: `src-${hash.slice(0, 4)}`, sourceHash: hash, chunkId: chunk, page, quote: 'a verbatim quote from the page' });

beforeEach(() => jest.resetModules());

function device(pdf?: { pages: number }) {
  const boundary = installNativeBoundary({ fs: true });
  if (pdf) require('react-native').NativeModules.PDFExtractorModule = { pageCount: async () => pdf.pages, extractPages: async () => [] };
  return {
    boundary, RNFS: require('react-native-fs'),
    cycles: require('../../../src/knowledge/cycles'), agents: require('../../../src/knowledge/agents'),
    ex: require('../../../src/knowledge/exchange'), docs: require('../../../src/knowledge/documents'),
    schema: require('../../../src/knowledge/schema'), storage: require('../../../src/knowledge/storage'),
  };
}
type Dev = ReturnType<typeof device>;

/** Two experts with a few findings each, one of them reviewed twice (so it is approved). */
async function teach(d: Dev) {
  const law = await d.agents.routeSubject('law firm pricing and billable hours');
  const acct = await d.agents.routeSubject('accounting: balance sheet and depreciation');
  const h1 = await d.cycles.startCycle({ agentId: law.agentId, topicId: law.topicId, topic: 'Law firm pricing', model: 'm' });
  const a = await d.cycles.addFinding(h1, { question: 'What is realization?', finding: 'Realization is the share of billed time actually collected.', confidence: 0.8, evidence: [ev(HASH_A, 'ch-a1', 3)] });
  await d.cycles.addFinding(h1, { question: 'What is utilization?', finding: 'Utilization is billable hours over available hours.', confidence: 0.7, evidence: [ev(HASH_A, 'ch-a2', 4)] });
  await d.cycles.addReview({ recordId: a.recordId, role: 'judge', decision: 'approved', reason: 'ok', by: 'test' });
  await d.cycles.addReview({ recordId: a.recordId, role: 'manager', decision: 'approved', reason: 'ok', by: 'test' });
  await d.cycles.finalizeCycle(h1, { status: 'completed', summary: 'law' });
  const h2 = await d.cycles.startCycle({ agentId: acct.agentId, topicId: acct.topicId, topic: 'Accounting', model: 'm' });
  await d.cycles.addFinding(h2, { question: 'What is depreciation?', finding: 'Depreciation spreads an asset cost over its useful life.', confidence: 0.8, evidence: [ev(HASH_B, 'ch-b1', 9)] });
  await d.cycles.finalizeCycle(h2, { status: 'completed', summary: 'acct' });
  return { law, acct, approvedId: a.recordId };
}

type Files = Record<string, string>;
/** The zip as a person would carry it: base64 bytes of the file. */
const snapshot = (d: Dev, path: string): Promise<string> => d.RNFS.readFile(path, 'base64');

/** A new device (empty disk) that has been handed the package. */
async function receive(b64: string): Promise<{ to: Dev; zipPath: string }> {
  jest.resetModules();
  const to = device();
  await to.RNFS.writeFile('/received/package.zip', b64, 'base64');
  return { to, zipPath: '/received/package.zip' };
}

/** Rewrites a package: decode, let the test change files, optionally keep the manifest/checksums honest, encode again. */
function rebuild(b64: string, mutate: (files: Files) => void, opts: { fixManifest?: boolean } = { fixManifest: true }): string {
  const archive = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as { zip: true; files: Record<string, string> };
  const files: Files = Object.fromEntries(Object.entries(archive.files).map(([k, v]) => [k, Buffer.from(v, 'base64').toString('utf8')]));
  mutate(files);
  if (opts.fixManifest !== false) {
    const manifest = JSON.parse(files['manifest.json']);
    const { sha256 } = require('js-sha256');
    const listed = new Map<string, { path: string; bytes: number; sha256: string }>(manifest.files.map((f: any) => [f.path, f]));
    for (const [path, text] of Object.entries(files)) {
      if (path === 'manifest.json' || path === 'checksums.json') continue;
      listed.set(path, { path, bytes: Buffer.byteLength(text), sha256: sha256(text) });
    }
    files['checksums.json'] = JSON.stringify({ algorithm: 'sha256', files: Object.fromEntries([...listed.entries()].map(([k, v]) => [k, v.sha256])) });
    listed.set('checksums.json', { path: 'checksums.json', bytes: Buffer.byteLength(files['checksums.json']), sha256: sha256(files['checksums.json']) });
    manifest.files = [...listed.values()];
    files['manifest.json'] = JSON.stringify(manifest);
  }
  return Buffer.from(JSON.stringify({ zip: true, files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, Buffer.from(v, 'utf8').toString('base64')])) })).toString('base64');
}

const unpack = async (d: Dev, zipPath: string) => {
  const dest = '/inspect';
  await require('react-native-zip-archive').unzip(zipPath, dest);
  return { dest, read: (p: string) => d.RNFS.readFile(`${dest}/${p}`, 'utf8') as Promise<string>, exists: (p: string) => d.RNFS.exists(`${dest}/${p}`) as Promise<boolean> };
};
const lines = (t: string) => t.split('\n').filter(Boolean).map((l) => JSON.parse(l));


describe('export scopes, previews and bad records', () => {
  it('exports by agent, subject and date, with originals, and records each export', async () => {
    const a = device(); const { law, acct } = await teach(a);
    const scopes: any[] = [{ kind: 'all' }, { kind: 'agents', agentIds: [law.agentId] }, { kind: 'subjects', topicIds: [acct.topicId] }, { kind: 'since', since: '2000-01-01T00:00:00Z' }, { kind: 'since', since: '2999-01-01T00:00:00Z' }, { kind: 'agents', agentIds: [] }];
    for (const scope of scopes) {
      const r = await a.ex.createExport({ scope, includeOriginals: true, appVersion: '9.9.9' });
      expect(r.manifest.exportId).toBeTruthy();
    }
    const auto = await a.ex.createExport({ scope: { kind: 'all' }, automatic: true } as never);
    expect(auto.path).toBeTruthy();
    expect(await a.ex.lastSuccessfulExport()).toBeTruthy();
    expect((await a.ex.transferHistory()).filter((t: any) => t.kind === 'export').length).toBeGreaterThanOrEqual(1);
  });

  it('previews an import without storing anything', async () => {
    const a = device(); await teach(a);
    const b64 = await snapshot(a, (await a.ex.createExport({ scope: { kind: 'all' } })).path);
    const { to: b, zipPath } = await receive(b64);
    const preview = await b.ex.previewImport(zipPath);
    expect(preview.valid).toBe(true);
    expect(preview.imported.findings).toBe(3);
    expect(await b.cycles.searchFindings({ limit: 10 })).toHaveLength(0);
  });

  it('rejects invalid agents, findings and cycles, and defers findings whose cycle already exists', async () => {
    const a = device(); await teach(a);
    const b64 = await snapshot(a, (await a.ex.createExport({ scope: { kind: 'all' } })).path);
    const broken = rebuild(b64, (files) => {
      files['agents.jsonl'] = `${files['agents.jsonl'].trim()}\n${JSON.stringify({ agentId: 'bad' })}\n`;
      for (const f of Object.keys(files)) {
        if (/^cycles\/[^/]+\/findings\.jsonl$/.test(f)) files[f] = `${files[f].trim()}\n${JSON.stringify({ recordId: 'junk' })}\n`;
      }
      const first = Object.keys(files).find((f) => /^cycles\/[^/]+\/report\.json$/.test(f))!;
      files[first] = '{"nope":true}';
      const docs = files['documents/index.json'];
      if (docs) files['documents/index.json'] = JSON.stringify({ docs: [{ sourceId: 'x' }, ...(JSON.parse(docs).docs ?? [])] });
    });
    const { to: b, zipPath } = await receive(broken);
    const report = await b.ex.applyImport(zipPath);
    expect(report.rejected.length).toBeGreaterThan(0);
    // importing the intact package then the same package under new finding ids defers on the existing cycle
    await b.RNFS.writeFile('/received/ok.zip', b64, 'base64');
    await b.ex.applyImport('/received/ok.zip');
    const renamed = rebuild(b64, (files) => {
      for (const f of Object.keys(files)) if (/^cycles\/[^/]+\/findings\.jsonl$/.test(f)) files[f] = files[f].replace(/"recordId":"([^"]+)"/g, '"recordId":"$1x"').replace(/"contentHash":"([^"]+)"/g, (_m, h) => `"contentHash":"${String(h).split('').reverse().join('')}"`);
    });
    await b.RNFS.writeFile('/received/again.zip', renamed, 'base64');
    const again = await b.ex.applyImport('/received/again.zip');
    expect(again.deferred.length + again.rejected.length + again.duplicates).toBeGreaterThan(0);
  });
});
