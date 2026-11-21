import { bodyOf, controllingNote, controllingReport, inferEntity } from '../../../src/standards/controlling';

describe('which body controls the subject', () => {
  it('reads the standard-setter from a document name, and nothing from a textbook', () => {
    expect(bodyOf('GASB Codification 2025.pdf')).toBe('GASB');
    expect(bodyOf('ASC 842 Leases.pdf')).toBe('FASB');
    expect(bodyOf('FASB ASU 2023-07.pdf')).toBe('FASB');
    expect(bodyOf('PCAOB AS 2110.pdf')).toBe('PCAOB');
    expect(bodyOf('AU-C 315.pdf')).toBe('AICPA');
    expect(bodyOf('Title 26 - Internal Revenue Code.pdf')).toBe('IRS');
    expect(bodyOf('IRS Pub 535 (2025).pdf')).toBe('IRS');
    expect(bodyOf('Intermediate Accounting 17th edition.pdf')).toBeNull();
  });
  it('tells who the rule is for from the course words', () => {
    expect(inferEntity('State and local governments: governmental funds')).toBe('government');
    expect(inferEntity('CPA FAR financial accounting and reporting')).toBe('private');
    expect(inferEntity('AUD audit sampling and attestation')).toBe('audit');
    expect(inferEntity('PCAOB audit of an issuer')).toBe('audit-public');
    expect(inferEntity('REG federal taxation of individuals')).toBe('tax');
    expect(inferEntity('Cooking basics')).toBe('unknown');
  });
});

describe('what the project holds against what controls', () => {
  it('flags a FASB document in a government course and the missing GASB one', () => {
    const r = controllingReport({ entity: 'government', documents: [{ name: 'ASC 958 Not-for-profit.pdf' }, { name: 'Governmental Accounting textbook.pdf' }] });
    expect(r.controlling).toEqual([]);
    expect(r.notControlling).toEqual(['ASC 958 Not-for-profit.pdf']);
    expect(r.missing).toEqual(['GASB']);
    expect(controllingNote(r)).toMatch(/No GASB document/);
    expect(controllingNote(r)).toMatch(/do not govern|does not govern state and local governments/);
  });
  it('accepts the controlling body and needs both FASB and SEC for a public company', () => {
    expect(controllingReport({ entity: 'private', documents: [{ name: 'ASC 842.pdf' }] })).toMatchObject({ controlling: ['ASC 842.pdf'], missing: [], notes: [] });
    expect(controllingReport({ entity: 'public', documents: [{ name: 'ASC 842.pdf' }] }).missing).toEqual(['SEC']);
  });
  it('flags a tax year that does not match and two editions of one book', () => {
    const r = controllingReport({ entity: 'tax', asOfYear: 2025, documents: [{ name: 'IRS Pub 535 (2023).pdf', year: 2023 }, { name: 'Title 26 IRC 2025.pdf', year: 2025 }, { name: 'Federal Taxation 2024.pdf', year: 2024 }, { name: 'Federal Taxation 2025.pdf', year: 2025 }] });
    expect(r.wrongYear).toEqual(['IRS Pub 535 (2023).pdf', 'Federal Taxation 2024.pdf']);
    expect(r.editionConflicts).toEqual([['Federal Taxation 2024.pdf', 'Federal Taxation 2025.pdf']]);
  });
  it('says plainly when the subject cannot be identified, and has no notes for a clean project', () => {
    expect(controllingReport({ entity: 'unknown', documents: [] }).notes[0]).toMatch(/could not be told/);
    expect(controllingNote(controllingReport({ entity: 'audit', documents: [{ name: 'AU-C 315.pdf' }] }))).toBe('');
  });
});

describe('in the lesson prompt', () => {
  it('puts the controlling-authority flags next to the passages', () => {
    const { contentMessages } = require('../../../src/topics/formats');
    const base = { courseTitle: 'C', topic: 'Leases', level: 'Complete beginner', how: '', style: '', square: { key: 's', format: 'lesson', title: 'Leases', focus: 'f', unit: 'u' }, before: [], minutes: 10, excerpts: [{ source: 'Book.pdf', text: 'lease text', rank: 5 }] };
    const flagged = contentMessages({ ...base, standardsFlags: 'No GASB document is in your project.\n' }).user;
    expect(flagged).toContain('No GASB document is in your project.');
    expect(contentMessages(base).user).not.toContain('No GASB');
    // The warning is for the case where nothing was found too (the controlling document is missing).
    expect(contentMessages({ ...base, excerpts: [], standardsFlags: 'No GASB document is in your project.\n' }).user).toContain('No GASB document');
  });
});
