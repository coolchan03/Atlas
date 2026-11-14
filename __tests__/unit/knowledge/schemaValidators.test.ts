import {
  isSafeArchivePath, SAFE_ID, SCHEMA_VERSION, validateAgentProfile, validateChunk, validateCycleReport, validateEvidence, validateFinding, validateManifest,
  validateReview, validateRevision, validateSourceDocument, validateTombstone,
} from '../../../src/knowledge/schema';

const HASH = 'a'.repeat(64);
const NOW = '2026-11-14T10:00:00Z';
const evidence = { sourceId: 'src-1', sourceHash: HASH, chunkId: 'chunk-1', page: 2 };
const finding = {
  schemaVersion: SCHEMA_VERSION, recordId: 'rec-1', sourceApp: 'atlas', deviceId: 'dev-1', cycleId: 'cyc-1', topicId: 'top-1', agentId: 'agent-1',
  question: 'What is a lease?', finding: 'A contract to use an asset.', uncertainty: '', confidence: 0.8, basis: 'observed', status: 'provisional',
  evidence: [evidence], review: { judge: 'pending', manager: 'pending' }, contentHash: HASH, revision: 1, createdAt: NOW, updatedAt: NOW,
};

describe('knowledge schema validators', () => {
  it('accepts a good record of every kind', () => {
    expect(validateFinding(finding)).toEqual([]);
    expect(validateEvidence(evidence)).toEqual([]);
    expect(validateReview({ schemaVersion: SCHEMA_VERSION, reviewId: 'r1', recordId: 'rec-1', role: 'judge', decision: 'approved', findingRevision: 1, evidenceHash: HASH, reason: 'ok', by: 'person', createdAt: NOW })).toEqual([]);
    expect(validateCycleReport({ schemaVersion: SCHEMA_VERSION, cycleId: 'c1', deviceId: 'd', agentId: 'a', topicId: 't', status: 'completed', startedAt: NOW, endedAt: NOW, attempted: {}, retained: {}, summary: 's' })).toEqual([]);
    expect(validateAgentProfile({ schemaVersion: SCHEMA_VERSION, agentId: 'a1', topicId: 't1', name: 'Tax', stage: 'expert', keywords: [] })).toEqual([]);
    expect(validateSourceDocument({ schemaVersion: SCHEMA_VERSION, sourceId: 's1', hash: HASH, name: 'book.pdf' })).toEqual([]);
    expect(validateChunk({ schemaVersion: SCHEMA_VERSION, chunkId: 'c1', sourceId: 's1', sourceHash: HASH, page: 1, text: 'text' })).toEqual([]);
    expect(validateRevision({ schemaVersion: SCHEMA_VERSION, revisionId: 'v1', recordId: 'rec-1', kind: 'correction', createdAt: NOW })).toEqual([]);
    expect(validateTombstone({ schemaVersion: SCHEMA_VERSION, tombstoneId: 't1', kind: 'document', targetId: 's1', createdAt: NOW })).toEqual([]);
    expect(validateManifest({ schemaVersion: SCHEMA_VERSION, bundleType: 'atlas-learning-export', exportId: 'e1', createdAt: NOW, counts: {}, files: [{ path: 'a.json', bytes: 3, sha256: HASH }] })).toEqual([]);
  });
  it('says exactly what is wrong with a bad finding, and never trusts approval alone', () => {
    const bad = validateFinding({ ...finding, schemaVersion: '9', recordId: '../x', question: '', uncertainty: 1, confidence: 2, status: 'maybe', basis: 'guess', contentHash: 'zz', revision: 0, createdAt: 'yesterday', updatedAt: 5, evidence: [{ sourceId: '!', sourceHash: 'no', chunkId: '', page: 0 }], review: { judge: 'x' } });
    for (const part of ['schemaVersion', 'recordId', 'question', 'uncertainty', 'confidence', 'status', 'basis', 'contentHash', 'revision', 'createdAt', 'updatedAt', 'evidence[0].sourceId', 'evidence[0].sourceHash', 'evidence[0].chunkId', 'evidence[0].page', 'review']) expect(bad.join('\n')).toContain(part);
    expect(validateFinding({ ...finding, status: 'approved', evidence: [] }).join('\n')).toMatch(/approved finding needs evidence/);
    expect(validateFinding({ ...finding, status: 'approved', review: { judge: 'approved', manager: 'pending' } }).join('\n')).toMatch(/both the judge and the manager/);
    expect(validateFinding({ ...finding, status: 'approved', review: { judge: 'approved', manager: 'approved' } })).toEqual([]);
    expect(validateFinding({ ...finding, evidence: 'none' }).join('\n')).toMatch(/evidence: must be a list/);
    expect(validateFinding({ ...finding, sourceApp: undefined }).join('\n')).toMatch(/sourceApp/);
    expect(validateFinding('text')).toEqual(['finding: not an object']);
    expect(validateEvidence(null)).toEqual(['evidence: not an object']);
  });
  it('flags problems in every other record kind', () => {
    expect(validateReview({ schemaVersion: SCHEMA_VERSION, reviewId: '', recordId: '', role: 'boss', decision: 'maybe', findingRevision: 0, evidenceHash: 'x', reason: 1, by: '', createdAt: 'x' }).length).toBeGreaterThanOrEqual(9);
    expect(validateCycleReport({ schemaVersion: SCHEMA_VERSION, cycleId: '', status: 'odd', startedAt: 'x', endedAt: 'y', summary: 1 }).join('\n')).toMatch(/cycleId[\s\S]*status[\s\S]*startedAt[\s\S]*endedAt[\s\S]*attempted and retained[\s\S]*summary/);
    expect(validateAgentProfile({ schemaVersion: SCHEMA_VERSION, agentId: '', topicId: '', name: '', stage: 'x', keywords: 'a' }).length).toBe(5);
    expect(validateSourceDocument({ schemaVersion: SCHEMA_VERSION, sourceId: '', hash: 'x', name: '' }).length).toBe(3);
    expect(validateChunk({ schemaVersion: SCHEMA_VERSION, chunkId: '', sourceId: '', sourceHash: 'x', page: 0, text: '' }).length).toBe(5);
    expect(validateRevision({ schemaVersion: SCHEMA_VERSION, revisionId: '', recordId: '', kind: 'x', createdAt: 'x' }).length).toBe(4);
    expect(validateTombstone({ schemaVersion: SCHEMA_VERSION, tombstoneId: '', kind: 'x', targetId: '', createdAt: 'x' }).length).toBe(4);
    const manifest = validateManifest({ schemaVersion: SCHEMA_VERSION, bundleType: 'other', exportId: '', createdAt: 'x', counts: 1, files: [{ path: '', bytes: 1.5, sha256: 'x' }] });
    expect(manifest.join('\n')).toMatch(/bundleType[\s\S]*exportId[\s\S]*createdAt[\s\S]*counts[\s\S]*files\[0\]/);
    expect(validateManifest({ schemaVersion: SCHEMA_VERSION, bundleType: 'atlas-learning-export', exportId: 'e', createdAt: NOW, counts: {}, files: 'x' }).join('\n')).toMatch(/files: must be a list/);
    for (const fn of [validateReview, validateCycleReport, validateAgentProfile, validateSourceDocument, validateChunk, validateRevision, validateTombstone, validateManifest]) expect(fn(7)[0]).toMatch(/not an object/);
  });
  it('keeps ids and archive paths to a safe alphabet', () => {
    expect(SAFE_ID.test('abc-1._x')).toBe(true); expect(SAFE_ID.test('-bad')).toBe(false); expect(SAFE_ID.test('a/b')).toBe(false);
    for (const ok of ['a/b.json', 'docs/c.txt']) expect(isSafeArchivePath(ok)).toBe(true);
    for (const bad of ['', '/abs', 'a\\b', '../x', 'a/../b', 'C:/x', 'x'.repeat(300)]) expect(isSafeArchivePath(bad)).toBe(false);
  });
});
