import { fromKnowledgeJsonl, toKnowledgeJsonl, type PortableClaim } from '../../../src/learning/knowledgeInterchange';
const claim: PortableClaim = {
  format: 'atlas-knowledge-jsonl', schemaVersion: 1, recordType: 'claim',
  id: 'claim-1', topic: 'taxes', question: 'What is the QBI deduction?',
  claim: 'This is a candidate statement.', status: 'candidate',
  reportId: 'report-1', createdAt: '2026-11-11T00:00:00Z', updatedAt: '2026-11-11T00:00:00Z',
  citations: [{source_id: '26USC199A',locator: 'Section 199A'}],
};
describe('portable Atlas knowledge interchange', () => {
  it('round-trips with stable, versioned JSONL', () => {
    expect(fromKnowledgeJsonl(toKnowledgeJsonl([claim]))).toEqual([claim]);
  });
  it('deduplicates an identical record and rejects conflicting copies', () => {
    const line = toKnowledgeJsonl([claim]);
    expect(fromKnowledgeJsonl(line + line)).toEqual([claim]);
    expect(() => fromKnowledgeJsonl(line + toKnowledgeJsonl([{ ...claim, status: 'verified' }]))).toThrow(/Conflicting/);
  });
  it('does not automatically promote candidate status', () => {
    expect(fromKnowledgeJsonl(toKnowledgeJsonl([claim]))[0].status).toBe('candidate');
  });
});
