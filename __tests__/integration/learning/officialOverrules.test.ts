/**
 * A standard-setter's own page overrules an older claim that rests only on a textbook: the textbook claim is marked superseded, with the
 * reason in its history, instead of both being disputed. A claim from an ordinary web page still only disputes. Real database.
 */
import { installRealSqlite } from '../../harness/sqliteFake';

function load() {
  installRealSqlite();
  const { learningKnowledgeDb: db } = require('../../../src/learning/knowledgeDb');
  const { ingestClaims } = require('../../../src/learning/claimIngest');
  return { db, ingestClaims };
}
const TOPIC = 'Leases';
const report = (n: string, text: string) => `ANSWER: ${text} [1]`;
const base = { topic: TOPIC, question: 'How is the discount rate set?', reportStatus: 'candidate' as const, reportNote: '' };

describe('official sources overrule the textbook', () => {
  it('marks the textbook claim superseded when an official page says otherwise', () => {
    const { db, ingestClaims } = load();
    ingestClaims(db, { ...base, reportId: 'book', reportText: report('1', 'A private company may elect a risk-free discount rate for lease liabilities of 3 percent in this example.'),
      sources: [{ n: 1, title: 'FAR textbook.pdf', kind: 'project', passage: 'A private company may elect a risk-free discount rate for lease liabilities of 3 percent in this example.' }] });
    const first = db.knownClaims(TOPIC)[0];
    const out = ingestClaims(db, { ...base, reportId: 'fasb', reportText: report('1', 'A private company may elect a risk-free discount rate for lease liabilities of 5 percent in this example.'),
      sources: [{ n: 1, title: 'ASC 842', kind: 'web', url: 'https://asc.fasb.org/topic/842', passage: 'A private company may elect a risk-free discount rate for lease liabilities of 5 percent in this example.' }] });
    expect(out).toMatchObject({ added: 1, updates: 1, contradictions: 0 });
    expect(db.getClaim(first.id).status).toBe('superseded');
    expect(db.openContradictions(10)).toHaveLength(0);
    const newest = db.knownClaims(TOPIC).find((k: { id: string }) => k.id !== first.id);
    expect(db.getClaim(newest.id).status).toBe('candidate'); // not disputed
    expect(db.knownClaims(TOPIC).some((k: { id: string }) => k.id === first.id)).toBe(false); // an overruled claim is no longer compared against
  });

  it('still records a disagreement when the newer claim comes from an ordinary web page', () => {
    const { db, ingestClaims } = load();
    ingestClaims(db, { ...base, reportId: 'book', reportText: report('1', 'A private company may elect a risk-free discount rate for lease liabilities of 3 percent in this example.'),
      sources: [{ n: 1, title: 'FAR textbook.pdf', kind: 'project', passage: 'A private company may elect a risk-free discount rate for lease liabilities of 3 percent in this example.' }] });
    const out = ingestClaims(db, { ...base, reportId: 'blog', reportText: report('1', 'A private company may elect a risk-free discount rate for lease liabilities of 5 percent in this example.'),
      sources: [{ n: 1, title: 'A blog', kind: 'web', url: 'https://example.com/leases', passage: 'A private company may elect a risk-free discount rate for lease liabilities of 5 percent in this example.' }] });
    expect(out).toMatchObject({ updates: 0, contradictions: 1 });
    expect(db.openContradictions(10)).toHaveLength(1);
  });
});
