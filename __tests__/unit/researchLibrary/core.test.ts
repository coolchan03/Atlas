/** The research-library core against a real SQLite engine: any library laid out as its manifest says is searchable, citable and readable. */
import { LibraryQueries, LibraryDb } from '../../../src/services/researchLibrary/db';
import { parseManifest } from '../../../src/services/researchLibrary/manifest';
import { searchLibrary, findReference, readDocument, documentStatus, documentVersions, LibraryContext } from '../../../src/services/researchLibrary/operations';
import { checkAnswer, evidenceBudget, fitEvidence, formatEvidence } from '../../../src/services/researchLibrary/context';
import { profileFor, registerProfile } from '../../../src/services/researchLibrary/profile';
import { legalUsProfile } from '../../../src/services/researchLibrary/profiles/legalUs';

const { DatabaseSync } = require('node:sqlite');

function build() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(`
    CREATE TABLE documents(id TEXT PRIMARY KEY, reference TEXT, title TEXT, kind TEXT, published TEXT, effective_from TEXT, effective_to TEXT, period_from INT, period_to INT, edition TEXT, source_path TEXT, source_url TEXT, checksum TEXT, status TEXT, quality TEXT, court TEXT);
    CREATE TABLE passages(id INTEGER PRIMARY KEY, document_id TEXT, locator TEXT, byte_start INT, byte_end INT, text TEXT);
    CREATE VIRTUAL TABLE passages_fts USING fts5(text, content='passages', content_rowid='id');
    CREATE TABLE links(from_id TEXT, to_id TEXT, kind TEXT, note TEXT);
    CREATE TABLE versions(family TEXT, document_id TEXT, edition TEXT, effective_from TEXT, effective_to TEXT);
    INSERT INTO documents VALUES
     ('s162','26 U.S.C. § 162','Trade or business expenses','statute','1986-10-22','1986-10-22',NULL,1987,NULL,NULL,'a.txt',NULL,'c1','verified',NULL,NULL),
     ('r162old','26 C.F.R. § 1.162-1','Business expenses (1990)','regulation','1990-01-01','1990-01-01','2005-12-31',1990,2005,'1990',NULL,NULL,'c2',NULL,NULL,NULL),
     ('r162','26 C.F.R. § 1.162-1','Business expenses','regulation','2006-01-01','2006-01-01',NULL,2006,NULL,'2006',NULL,NULL,'c3',NULL,NULL,NULL),
     ('c1','123 T.C. 45','Smith v. Commissioner','case','2004-05-01',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'c4',NULL,NULL,'Tax Court');
    INSERT INTO passages VALUES
     (1,'s162','(a)',0,0,'There shall be allowed as a deduction all the ordinary and necessary expenses paid or incurred during the taxable year in carrying on any trade or business.'),
     (2,'s162','(c)',0,0,'No deduction shall be allowed under subsection (a) for any illegal bribe or kickback.'),
     (3,'r162','(a)',0,0,'Business expenses deductible from gross income include the ordinary and necessary expenditures directly connected with the taxpayer business.'),
     (4,'r162old','(a)',0,0,'Old rule: business expenses are deductible when ordinary and necessary.'),
     (5,'c1','',0,0,'The court held that the expenses were personal and not deductible as ordinary business expenses.');
    INSERT INTO passages_fts(rowid, text) SELECT id, text FROM passages;
    INSERT INTO links VALUES ('c1','s162','cites',NULL), ('r162','r162old','supersedes',NULL), ('s162','r162','cited_by_later','');
    INSERT INTO versions VALUES ('reg162-1','r162old','1990','1990-01-01','2005-12-31'), ('reg162-1','r162','2006','2006-01-01',NULL);
  `);
  const db: LibraryDb = { all: async (sql, params = []) => raw.prepare(sql).all(...params) };
  const parsed = parseManifest({ schema: 'atlas-research-library/v1', id: 'demo-law', name: 'Demo law', version: '1', database: 'Index/x.sqlite', profile: 'legal-us', facets: [{ key: 'court', column: 'court' }] });
  if (!('manifest' in parsed)) throw new Error(parsed.problems.join());
  registerProfile(legalUsProfile);
  const ctx: LibraryContext = { id: 'demo-law', manifest: parsed.manifest, queries: new LibraryQueries(db, parsed.manifest), profile: profileFor('legal-us'), readSource: async () => '' };
  return { ctx, db };
}

describe('manifest', () => {
  it('refuses names that could carry SQL, absolute paths and a writable library', () => {
    const bad = parseManifest({ schema: 'atlas-research-library/v1', id: 'x1', name: 'x', version: '1', database: '/etc/db', tables: { documents: { table: 'a; DROP TABLE b' } }, readOnly: false });
    expect('problems' in bad && bad.problems.length).toBeGreaterThanOrEqual(3);
  });
});

describe('research library core', () => {
  it('searches by topic, keeps only what applies to the period, and marks what is unknown', async () => {
    const { ctx } = build();
    const all = await searchLibrary(ctx, 'ordinary necessary business expenses', { limit: 10 });
    expect(all.map((e) => e.documentId)).toEqual(expect.arrayContaining(['s162', 'r162', 'r162old', 'c1']));
    const y1995 = await searchLibrary(ctx, 'ordinary necessary business expenses', { period: 1995, limit: 10 });
    expect(y1995.map((e) => e.documentId)).not.toContain('r162'); // the 2006 regulation does not apply to 1995
    expect(y1995.map((e) => e.documentId)).toContain('r162old');
    expect(y1995.find((e) => e.documentId === 'c1')?.applies).toBe('unknown'); // a decision records no period: shown, but marked
    expect(y1995.every((e) => e.statusVerified === (e.documentId === 's162'))).toBe(true);
  });

  it('finds a typed reference in any usual spelling, and the part asked for', async () => {
    const { ctx } = build();
    const r = await findReference(ctx, 'IRC § 162(c)');
    expect(r.documents[0].id).toBe('s162');
    expect(r.passages.map((p) => p.locator)).toEqual(['(c)']);
    expect((await findReference(ctx, 'Treas. Reg. 1.162-1', { period: 2010 })).documents.length).toBe(2);
  });

  it('reads a document in bounded parts and reports status without claiming more than the library knows', async () => {
    const { ctx } = build();
    const read = await readDocument(ctx, 's162');
    expect(read?.text).toContain('(c) No deduction');
    const status = await documentStatus(ctx, 'r162old');
    expect(status.verified).toBe(false);
    expect(status.laterTreatment[0].kind).toBe('supersedes');
    expect((await documentStatus(ctx, 'c1')).statement).toMatch(/NOT verified/);
    const versions = await documentVersions(ctx, 'r162', 1995);
    expect(versions.versions.map((v) => [v.edition, v.applies])).toEqual([['1990', 'yes'], ['2006', 'no']]);
  });

  it('fits evidence to the model\'s own context and catches invented citations', async () => {
    const { ctx } = build();
    const ev = await searchLibrary(ctx, 'ordinary necessary business expenses', { limit: 3 });
    expect(evidenceBudget(8192).evidence).toBe(2867);
    expect(fitEvidence(ev, 60).length).toBeLessThan(ev.length + 1);
    expect(formatEvidence(ev)).toContain('[1]');
    const answer = `Under IRC § 999(z) [9] "this exact sentence was never in the library at all" applies. See ${ev[0].reference} [1].`;
    const check = checkAnswer(answer, ev, ctx.profile);
    expect(check.unknownNumbers).toEqual([9]);
    expect(check.unretrievedReferences.join()).toMatch(/999/);
    expect(check.quotesNotFound.length).toBe(1);
    expect(checkAnswer(`${ev[0].reference} [1]`, ev, ctx.profile).ok).toBe(true);
  });
});
