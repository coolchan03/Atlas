import { quotedSentence, unbackedLines } from '../../../src/topics/citations';
import { contentMessages } from '../../../src/topics/formats';
import { REWRITES } from '../../../src/topics/service';
import { taxFromText, yearNotes, classifyTaxSource, setTaxLookup } from '../../../src/standards/taxSources';

const lesson = (text: string, keyPoints: string[] = []) => ({ kind: 'lesson' as const, sections: [{ heading: 'h', text }], keyPoints });

describe('quoting and unbacked lines', () => {
  const passage = 'Leases are common. A lessee records a right-of-use asset and a lease liability at commencement. Other things follow.';
  it('highlights the sentence the lesson leans on', () => {
    const q = quotedSentence(passage, 'The lessee records a right-of-use asset and a lease liability.');
    expect(q.hit).toBe('A lessee records a right-of-use asset and a lease liability at commencement.');
    expect(q.before + q.hit + q.after).toBe(passage);
    expect(quotedSentence(passage, 'Nothing alike at all here.').hit).toBe('');
  });
  it('flags a factual line no passage backs, and nothing when there were no passages', () => {
    const c = lesson('The lessee records a right-of-use asset and a lease liability at commencement. The discount rate must always equal 7.5 percent for every private company lease contract.');
    expect(unbackedLines(c, [{ text: passage }])).toEqual(['The discount rate must always equal 7.5 percent for every private company lease contract.']);
    expect(unbackedLines(c, [])).toEqual([]);
  });
});

describe('tax kind and year from the first pages', () => {
  it('reads a publication, a bulletin and the regulations from their text', () => {
    expect(taxFromText('Department of the Treasury Internal Revenue Service Publication 17 Cat. No. 10311G Your Federal Income Tax For use in preparing 2024 Returns')).toMatchObject({ kind: 'publication', year: 2024, series: 'pub-17' });
    expect(taxFromText('Internal Revenue Bulletin: 2024-31 August 1, 2024')).toMatchObject({ kind: 'bulletin', year: 2024 });
    expect(taxFromText('Title 26 Code of Federal Regulations, 26 CFR Part 1, revised as of April 1, 2025 Internal Revenue')).toMatchObject({ kind: 'regulation', year: 2025 });
    expect(taxFromText('A chapter on leases.')).toBeNull();
  });
  it('uses what was learned when the file name says nothing', () => {
    setTaxLookup((n) => (n === 'scan0042.pdf' ? { kind: 'publication', rank: 4, label: 'IRS publication', year: 2023, series: 'pub-17' } : undefined));
    expect(classifyTaxSource('scan0042.pdf')).toMatchObject({ kind: 'publication', year: 2023 });
    setTaxLookup(() => undefined);
  });
});

describe('the year asked about', () => {
  it('warns when a source is for another year, and stays quiet otherwise', () => {
    expect(yearNotes('What is the standard deduction for 2024?', ['IRS Pub 17 (2023).pdf'])).toMatch(/Pub 17 \(2023\)\.pdf is for 2023/);
    expect(yearNotes('What is the standard deduction for 2024?', ['IRS Pub 17 (2024).pdf'])).toBe('');
    expect(yearNotes('What is the standard deduction?', ['IRS Pub 17 (2023).pdf'])).toBe('');
  });
});

describe('quizzes and rewrites', () => {
  const base = { courseTitle: 'C', topic: 'FAR', level: 'x', how: '', style: '', square: { key: 's1', format: 'quiz', title: 'Leases: quiz', focus: 'f', unit: 'u' }, before: [], minutes: 10 };
  it('asks again, in new words, about questions the learner got wrong', () => {
    const m = contentMessages({ ...base, retry: ['What does a lessee record at commencement?'] } as any);
    expect(m.user).toMatch(/got these wrong earlier/);
    expect(m.user).toMatch(/What does a lessee record at commencement\?/);
  });
  it('rewrites an unclear lesson the way the learner asked', () => {
    const m = contentMessages({ ...base, square: { ...base.square, format: 'lesson' }, rewrite: REWRITES.simpler } as any);
    expect(m.user).toMatch(/simpler words/);
  });
});
