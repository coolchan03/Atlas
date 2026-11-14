import { labelFromRecord, searchLabels, tidyLabels } from '../../../src/drugs/openFda';

const record = (over: Record<string, unknown> = {}) => ({
  set_id: 'abc', effective_time: '20250314',
  openfda: { brand_name: ['Advil'], generic_name: ['IBUPROFEN'], manufacturer_name: ['Haleon'], route: ['ORAL'], product_type: ['HUMAN OTC DRUG'] },
  indications_and_usage: ['Uses temporarily relieves minor aches and pains.'],
  warnings: ['Stomach bleeding warning.', 'Allergy alert.'],
  drug_interactions: [],
  ...over,
});

describe('reading an openFDA label', () => {
  it('keeps the names, kind, date and every section that has text', () => {
    const l = labelFromRecord(record())!;
    expect(l).toMatchObject({ id: 'abc', brand: 'Advil', generic: 'IBUPROFEN', manufacturer: 'Haleon', type: 'OTC', route: 'ORAL', updated: '2025-03-14' });
    expect(l.sections.indications).toContain('minor aches');
    expect(l.sections.warnings).toBe('Stomach bleeding warning.\n\nAllergy alert.');
    expect(l.sections.interactions).toBeUndefined();
  });

  it('tells prescription from unknown, and refuses a record with no id or no name', () => {
    expect(labelFromRecord(record({ openfda: { generic_name: ['x'], product_type: ['HUMAN PRESCRIPTION DRUG'] } }))!.type).toBe('Rx');
    expect(labelFromRecord(record({ openfda: { generic_name: ['x'] } }))!.type).toBe('');
    expect(labelFromRecord(record({ set_id: undefined }))).toBeNull();
    expect(labelFromRecord(record({ openfda: {} }))).toBeNull();
  });
});

describe('looking a medicine up', () => {
  const answer = (status: number, body: unknown = {}) => jest.fn(async () => ({ status, ok: status >= 200 && status < 300, json: async () => body })) as unknown as typeof fetch;

  it('asks for the brand or generic name, safely quoted, and drops repeated labels', async () => {
    const f = answer(200, { results: [record(), record(), record({ set_id: 'def' })] });
    const out = await searchLabels('  ibu"profen+ ', 5, f);
    expect(out.map((l) => l.id)).toEqual(['abc', 'def']);
    const url = String((f as jest.Mock).mock.calls[0][0]);
    expect(url).toContain('openfda.brand_name:%22ibu%20profen%22+OR+openfda.generic_name:%22ibu%20profen%22');
    expect(url).toContain('limit=5');
  });

  it('treats a 404 as no results, anything else as a failure, and an empty name as nothing to look up', async () => {
    expect(await searchLabels('zzzz', 5, answer(404))).toEqual([]);
    await expect(searchLabels('x', 5, answer(500))).rejects.toThrow('answered 500');
    expect(await searchLabels('   ', 5, answer(200))).toEqual([]);
  });

  it('puts recently revised labels first, one per brand and maker', () => {
    const a = labelFromRecord(record({ effective_time: '20200101', set_id: 'old' }))!;
    const b = labelFromRecord(record({ effective_time: '20250101', set_id: 'new' }))!;
    expect(tidyLabels([a, b]).map((l) => l.id)).toEqual(['new']);
  });
});
