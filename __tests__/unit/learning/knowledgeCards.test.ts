import { approvedCards, claimCard, deepPassages, findingCard, mergeCards, summarizeCards, CARD_CHARS } from '../../../src/learning/knowledgeCards';

const finding = (o: any = {}) => ({ recordId: 'r1', topicId: 't', question: 'How is a lease liability measured?', finding: 'It is the present value of unpaid lease payments.', status: 'approved', uncertainty: '', documentTitle: 'ASC 842.pdf', evidence: [{ sourceId: 's', sourceHash: 'h', chunkId: 'c', quote: 'present value of lease payments', page: 12 }], ...o });

describe('hot knowledge cards', () => {
  it('builds short cards that copy the record status and point to the deep record', () => {
    const long = 'x '.repeat(400);
    const c = claimCard({ id: 'a', text: long, status: 'candidate', topic: 'leases', question: 'Q?', sources: ['Book.pdf'], evidenceCount: 1 })!;
    expect(c.text.length).toBeLessThanOrEqual(CARD_CHARS);
    expect(c).toMatchObject({ status: 'candidate', origin: 'claim', deep: { origin: 'claim', id: 'a' }, hasEvidence: true, source: 'Book.pdf' });
    const f = findingCard(finding() as any, 'leases')!;
    expect(f).toMatchObject({ status: 'verified', origin: 'finding', source: 'ASC 842.pdf', hasEvidence: true });
  });

  it('makes no card for rejected or superseded records, and maps conflicts to disputed', () => {
    expect(claimCard({ id: 'a', text: 't', status: 'rejected', topic: 'x' })).toBeNull();
    expect(claimCard({ id: 'a', text: 't', status: 'superseded', topic: 'x' })).toBeNull();
    expect(findingCard(finding({ status: 'rejected' }) as any, 't')).toBeNull();
    expect(findingCard(finding({ status: 'conflicted' }) as any, 't')!.status).toBe('disputed');
    expect(findingCard(finding({ status: 'provisional' }) as any, 't')!.status).toBe('candidate');
  });

  it('never promotes: a candidate merged with a duplicate keeps the best status a record actually has, and a dispute wins', () => {
    const cand = claimCard({ id: '1', text: 'Same statement here.', status: 'candidate', topic: 't', evidenceCount: 0 })!;
    const dup = claimCard({ id: '2', text: 'same statement here', status: 'candidate', topic: 't', evidenceCount: 1 })!;
    expect(mergeCards([cand, dup])).toHaveLength(1);
    expect(mergeCards([cand, dup])[0].status).toBe('candidate');
    expect(mergeCards([cand, dup])[0].hasEvidence).toBe(true);
    const ok = claimCard({ id: '3', text: 'Same statement here', status: 'verified', topic: 't', evidenceCount: 1 })!;
    const bad = claimCard({ id: '4', text: 'Same statement here', status: 'disputed', topic: 't', evidenceCount: 1 })!;
    expect(mergeCards([ok, bad])[0].status).toBe('disputed');
    expect(mergeCards([claimCard({ id: '5', text: 'Other topic text', status: 'verified', topic: 'a' })!, claimCard({ id: '6', text: 'Other topic text', status: 'verified', topic: 'b' })!])).toHaveLength(2);
  });

  it('treats only verified cards that have evidence as approved', () => {
    const v = claimCard({ id: '1', text: 'A', status: 'verified', topic: 't', evidenceCount: 1 })!;
    const noEvidence = claimCard({ id: '2', text: 'B', status: 'verified', topic: 't', evidenceCount: 0 })!;
    const c = claimCard({ id: '3', text: 'C', status: 'candidate', topic: 't', evidenceCount: 2 })!;
    expect(approvedCards([v, noEvidence, c]).map((x) => x.id)).toEqual(['claim:1']);
    expect(summarizeCards([v, noEvidence, c])).toMatchObject({ total: 3, verified: 2, candidate: 1, withoutEvidence: 1, fromClaims: 3 });
  });

  it('fetches deep passages from the owning store only when asked', async () => {
    const claim = jest.fn(() => [{ title: 'Book', locator: 'p.3', passage: 'text' }, { title: 'Empty', locator: '', passage: ' ' }]);
    const fnd = jest.fn(async () => [{ title: 'ASC', locator: 'page 12', passage: 'quote' }]);
    const c = claimCard({ id: 'a', text: 'T', status: 'verified', topic: 't', evidenceCount: 1 })!;
    expect(claim).not.toHaveBeenCalled();
    expect(await deepPassages(c, { claim, finding: fnd })).toEqual([{ title: 'Book', locator: 'p.3', passage: 'text' }]);
    expect(await deepPassages(findingCard(finding() as any, 't')!, { claim, finding: fnd })).toHaveLength(1);
    expect(fnd).toHaveBeenCalledWith('r1');
  });
});
