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

describe('a standard-like file name is not enough on its own', () => {
  const { useOfficialDocs, noteIfStandard, studyMaterialFromText } = require('../../../src/standards/officialDocs');
  const { isOfficialDocumentName, documentStanding } = require('../../../src/standards/authority');
  beforeEach(() => useOfficialDocs.setState({ names: [], refused: [], studyMaterial: [], tax: {}, roles: {} }));

  const book = `FASB ASC 842 Leases: A Practical Guide\nSeventh Edition\nISBN 978-1-23456-789-0\nCopyright 2023 by John Wiley & Sons\nLearning Objectives\nAfter reading this chapter you will be able to...`;
  const standard = `Financial Accounting Standards Board\nAccounting Standards Update No. 2016-02\nLeases (Topic 842)\nAmendments to the FASB Accounting Standards Codification`;

  it('recognises the first pages of a published book, and not those of a standard', () => {
    expect(studyMaterialFromText(book)).toBe(true);
    expect(studyMaterialFromText(standard)).toBe(false);
    expect(studyMaterialFromText('ISBN only here, nothing else of a book')).toBe(false); // one sign is not enough
  });

  it('a textbook named like a standard loses the standard-setter rank once its first pages show it is a book', () => {
    expect(isOfficialDocumentName('FASB ASC 842 Guide.pdf')).toBe(true); // by name alone, before anything is read
    noteIfStandard('FASB ASC 842 Guide.pdf', book);
    expect(isOfficialDocumentName('FASB ASC 842 Guide.pdf')).toBe(false);
    expect(documentStanding('FASB ASC 842 Guide.pdf').rank).toBeGreaterThan(1);
  });

  it('a book whose cover names the standard and the body is not marked official from its first pages either', () => {
    expect(noteIfStandard('Leases Guide.pdf', book)).toBe(false);
    expect(useOfficialDocs.getState().names).not.toContain('Leases Guide.pdf');
  });

  it('a real standard keeps its rank, and a file the person marked themselves keeps it too', () => {
    noteIfStandard('ASU 2016-02.pdf', standard);
    expect(isOfficialDocumentName('ASU 2016-02.pdf')).toBe(true);
    noteIfStandard('FASB Guide.pdf', book);
    useOfficialDocs.getState().mark('FASB Guide.pdf'); // the person says it is the standard
    expect(isOfficialDocumentName('FASB Guide.pdf')).toBe(true);
  });

  it('a file with a standard-like name whose pages were never read is still treated by its name (nothing contradicts it)', () => {
    expect(isOfficialDocumentName('ASU 2023-07.pdf')).toBe(true);
  });
});
