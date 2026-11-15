/** Telling Atlas a document is the standard itself: by marking it, or because its first pages say it is one. */
function load() {
  jest.resetModules();
  const docs = require('../../../src/standards/officialDocs');
  const auth = require('../../../src/standards/authority');
  return { ...docs, ...auth };
}

const ASU = 'Accounting Standards Update No. 2016-13\nFinancial Instruments, Credit Losses (Topic 326)\nFinancial Accounting Standards Board\nNorwalk, Connecticut';
const BOOK = 'Intermediate Accounting, 16th Edition. Chapter 1: The environment of financial accounting. Standards are set by the FASB.';

describe('recognising a standard from its first pages', () => {
  it('needs both the board and a standard\'s name, and not just a mention in a textbook', () => {
    const { standardFromText } = load();
    expect(standardFromText(ASU)).toBe(true);
    expect(standardFromText('FASB Accounting Standards Codification\nTopic 842 Leases')).toBe(true);
    expect(standardFromText(BOOK)).toBe(false);
    expect(standardFromText('')).toBe(false);
    expect(standardFromText(`${'x '.repeat(4000)}${ASU}`)).toBe(false); // only the start counts
  });
});

describe('marking documents', () => {
  it('marks a document found to be a standard, so it counts under any name, and not a textbook', () => {
    const { noteIfStandard, isOfficialDocumentName, isOfficialSource } = load();
    expect(isOfficialDocumentName('scan_0042.pdf')).toBe(false);
    expect(noteIfStandard('scan_0042.pdf', ASU)).toBe(true);
    expect(isOfficialDocumentName('scan_0042.pdf')).toBe(true);
    expect(isOfficialSource({ kind: 'project', title: 'scan_0042.pdf' })).toBe(true);
    expect(noteIfStandard('Becker FAR.pdf', BOOK)).toBe(false);
    expect(isOfficialDocumentName('Becker FAR.pdf')).toBe(false);
  });

  it('lets the person mark any document, and take the mark off one Atlas recognised without it coming back', () => {
    const { useOfficialDocs, noteIfStandard, isOfficialDocumentName } = load();
    useOfficialDocs.getState().mark('Notes from the board.pdf');
    expect(isOfficialDocumentName('Notes from the board.pdf')).toBe(true);
    expect(noteIfStandard('scan.pdf', ASU)).toBe(true);
    useOfficialDocs.getState().unmark('scan.pdf');
    expect(isOfficialDocumentName('scan.pdf')).toBe(false);
    expect(noteIfStandard('scan.pdf', ASU)).toBe(false); // added again: the refusal is respected
    useOfficialDocs.getState().mark('scan.pdf'); // marking by hand clears the refusal
    expect(isOfficialDocumentName('scan.pdf')).toBe(true);
  });

  it('lets a marked document overrule a textbook in the learning ledger', () => {
    const { useOfficialDocs, overrules } = load();
    useOfficialDocs.getState().mark('scan_0042.pdf');
    expect(overrules([{ kind: 'project', title: 'scan_0042.pdf' }], [{ kind: 'project', title: 'Becker FAR.pdf' }])).toBe(true);
    expect(overrules([{ kind: 'project', title: 'Becker FAR.pdf' }], [{ kind: 'project', title: 'scan_0042.pdf' }])).toBe(false);
  });
});
