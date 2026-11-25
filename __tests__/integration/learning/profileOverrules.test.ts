/**
 * A subject's source profile decides which source wins. A claim from a higher kind of source replaces a lower one instead of starting a
 * dispute (a filing over news; the person's own "Statutes over Opinions"), and two sources of the same rank with no way to choose still dispute.
 */
import { installRealSqlite } from '../../harness/sqliteFake';

function load() {
  installRealSqlite();
  const { learningKnowledgeDb: db } = require('../../../src/learning/knowledgeDb');
  const { ingestClaims } = require('../../../src/learning/claimIngest');
  const { profileFor } = require('../../../src/standards/profiles');
  return { db, ingestClaims, profileFor };
}
const base = { topic: 'Apple', question: 'What was services revenue?', reportStatus: 'candidate' as const, reportNote: '' };
const claim = (text: string) => `ANSWER: ${text} [1]`;
const src = (title: string, text: string, url?: string) => [{ n: 1, title, kind: url ? 'web' : 'project', url, passage: text }];
const OLD = 'Apple services revenue for the year was 78 billion dollars according to this note.';
const NEW = 'Apple services revenue for the year was 85 billion dollars according to this note.';

it('a filing replaces a news claim in a markets subject, where before both would be disputed', () => {
  const { db, ingestClaims, profileFor } = load();
  const profile = profileFor('equities', undefined, []);
  ingestClaims(db, { ...base, profile, reportId: 'news', reportText: claim(OLD), sources: src('Analyst note AAPL 2024.pdf', OLD) });
  const first = db.knownClaims('Apple')[0];
  const out = ingestClaims(db, { ...base, profile, reportId: 'filing', reportText: claim(NEW), sources: src('AAPL 10-K 2024.pdf', NEW) });
  expect(out).toMatchObject({ updates: 1, contradictions: 0 });
  expect(db.getClaim(first.id).status).toBe('superseded');
  expect(db.openContradictions(10)).toHaveLength(0);
});

it('two sources of the same kind that cannot be ranked still dispute, and the lower one never replaces the higher', () => {
  const { db, ingestClaims, profileFor } = load();
  const profile = profileFor('equities', undefined, []);
  ingestClaims(db, { ...base, profile, reportId: 'f1', reportText: claim(OLD), sources: src('AAPL 10-K 2023.pdf', OLD) });
  const same = ingestClaims(db, { ...base, profile, reportId: 'f2', reportText: claim(NEW), sources: src('MSFT 10-K 2023.pdf', NEW) });
  expect(same).toMatchObject({ updates: 0, contradictions: 1 });

  const second = load();
  const p2 = second.profileFor('equities', undefined, []);
  second.ingestClaims(second.db, { ...base, profile: p2, reportId: 'filing', reportText: claim(OLD), sources: src('AAPL 10-K 2024.pdf', OLD) });
  const lower = second.ingestClaims(second.db, { ...base, profile: p2, reportId: 'news', reportText: claim(NEW), sources: src('Analyst note AAPL 2024.pdf', NEW) });
  expect(lower).toMatchObject({ updates: 0, contradictions: 1 }); // news does not overrule a filing
});

it('follows the order the person wrote, by title or by an address on their own sites', () => {
  const { db, ingestClaims, profileFor } = load();
  const profile = profileFor('custom', 'Statutes | statute, code | edition\nOpinions | opinion, ruling\nsites: law.example.org', []);
  ingestClaims(db, { ...base, topic: 'Apple', profile, reportId: 'o', reportText: claim(OLD), sources: src('District opinion on revenue.pdf', OLD) });
  const out = ingestClaims(db, { ...base, profile, reportId: 's', reportText: claim(NEW), sources: src('The Revenue Statute', NEW, 'https://law.example.org/revenue') });
  expect(out).toMatchObject({ updates: 1, contradictions: 0 });
});
