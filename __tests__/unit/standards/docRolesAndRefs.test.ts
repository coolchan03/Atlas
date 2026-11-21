import { sectionRefs, refScore, crossReferences, indexOfRef } from '../../../src/services/rag/sectionRefs';
import { defaultRole } from '../../../src/standards/docRoles';
import { figuresIn, unverifiedFigure } from '../../../src/topics/citations';
import { mentions, rate } from '../../../src/cpa/coverage';
import { authorityNote } from '../../../src/topics/formats';
import { isEnabled } from '../../../src/standards/docRoles';
import { classifyTaxSource, supersededEditions } from '../../../src/standards/taxSources';
import { matchExam } from '../../../src/cpa/blueprints';

describe('exact references in a question', () => {
  it('finds sections, regulations, ASC topics, ASUs, rulings and notices, and not a bare number', () => {
    expect(sectionRefs('What does § 179 allow?').map((r) => `${r.kind} ${r.id}`)).toEqual(['section 179']);
    expect(sectionRefs('explain section 1245(a) recapture')[0]).toMatchObject({ kind: 'section', id: '1245(a)' });
    expect(sectionRefs('Treas. Reg. 1.263(a)-1 repairs')[0]).toMatchObject({ kind: 'regulation', id: '1.263(a)-1' });
    expect(sectionRefs('ASC 842-10-25 and ASU 2016-02').map((r) => r.kind)).toEqual(['asc', 'asu']);
    expect(sectionRefs('Rev. Proc. 2024-40 and Notice 2024-5').map((r) => r.kind)).toEqual(['ruling', 'notice']);
    expect(sectionRefs('the 179 deduction limit')).toEqual([]);
  });
  it('prefers a passage that opens with the section over one that only mentions it', () => {
    const refs = sectionRefs('§ 179');
    expect(refScore('§ 179. Election to expense certain depreciable business assets', refs)).toBe(3);
    expect(refScore('Property is described in the text, see also § 179 for expensing.'.padStart(500, ' '), refs)).toBeLessThan(3);
    expect(refScore('Nothing about it', refs)).toBe(0);
  });
});

describe('following the pointers in the law', () => {
  it('finds the other sections a passage points to, and not the section it is', () => {
    const passage = '§ 179. Election to expense. The term section 179 property means tangible property to which section 168 applies, see also section 1245(a) and Reg. 1.179-1.';
    const ids = crossReferences(passage, 5).map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['168', '1245(a)']));
    expect(ids).not.toContain('179');
  });
});

describe('what a document is for', () => {
  it('textbooks and IRS publications teach; the Code, regulations, bulletins and standards are reference', () => {
    expect(defaultRole('Intermediate Accounting.pdf')).toBe('teach');
    expect(defaultRole('IRS Pub 17 (2024).pdf')).toBe('teach');
    expect(defaultRole('Title 26 - Internal Revenue Code.pdf')).toBe('reference');
    expect(defaultRole('26 CFR Part 1 (2025).pdf')).toBe('reference');
    expect(defaultRole('irb24-31.pdf')).toBe('reference');
    expect(defaultRole('ASC 842 Leases (FASB).pdf')).toBe('reference');
  });
  it('tells the lesson to check against reference passages, not copy them', () => {
    expect(authorityNote([{ source: 'IRC.pdf', rank: 1, role: 'reference' }, { source: 'Book.pdf', rank: 5, role: 'teach' }])).toMatch(/Do not copy their wording/);
  });
});

describe('numbers in quiz answers', () => {
  it('flags a right answer whose figure no passage shows, and not one that is shown', () => {
    expect(figuresIn('$1,250 at 7.5% in 2024')).toEqual(['1250', '7.5']);
    const q = { q: 'What is the limit?', options: ['$1,250,000', '$900,000'], answer: 0 };
    expect(unverifiedFigure(q, 'The limit is $1,250,000 for the year.')).toBeNull();
    expect(unverifiedFigure(q, 'The limit is high.')).toMatch(/Check 1250000/);
    expect(unverifiedFigure(q, '')).toBeNull();
  });
});

describe('coverage', () => {
  it('counts a passage only when it really mentions the topic, and rates by books and passages', () => {
    expect(mentions('Intangible assets and goodwill', 'Goodwill and other intangible assets are tested for impairment.')).toBe(true);
    expect(mentions('Intangible assets and goodwill', 'Inventory is measured at cost.')).toBe(false);
    expect([rate(2, 3), rate(1, 5), rate(0, 0)]).toEqual(['good', 'thin', 'none']);
  });
});

describe('review fixes', () => {
  it('a reference is a whole reference: § 179 is not § 179A or § 1790', () => {
    expect(indexOfRef('see § 179a for more', '§ 179')).toBe(-1);
    expect(indexOfRef('see § 1790 for more', '§ 179')).toBe(-1);
    expect(indexOfRef('see § 179(b) for more', '§ 179')).toBe(4);
    expect(indexOfRef('§ 179. Election', '§ 179')).toBe(0);
    expect(refScore('§ 179A. Allowance for clean-fuel vehicles', sectionRefs('§ 179'))).toBe(0);
  });
  it('a document switched off (0) is not enabled', () => {
    expect([isEnabled({ enabled: 0 }), isEnabled({ enabled: 1 }), isEnabled({ enabled: false }), isEnabled({})]).toEqual([false, true, false, true]);
  });
  it('different parts of the regulations are different works, not editions of one', () => {
    expect(classifyTaxSource('26 CFR Part 1 (2023).pdf')?.series).not.toBe(classifyTaxSource('26 CFR Part 301 (2024).pdf')?.series);
    expect([...supersededEditions(['26 CFR Part 1 (2023).pdf', '26 CFR Part 301 (2024).pdf'])]).toEqual([]);
    expect([...supersededEditions(['26 CFR Part 1 (2023).pdf', '26 CFR Part 1 (2025).pdf'])]).toEqual(['26 CFR Part 1 (2023).pdf']);
  });
  it('a topic that only mentions an exam word is not an exam', () => {
    expect(matchExam('A far-reaching study of Roman history')).toBeNull();
    expect(matchExam('Learn Python for the SAT')).toBeNull();
    expect(matchExam('I sat down to study chemistry')).toBeNull();
    expect(matchExam('CPA FAR')).toBe('FAR');
    expect(matchExam('usmle step 1')).toBe('USMLE1');
  });
});
