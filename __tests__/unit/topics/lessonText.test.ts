import { contentMessages, exampleIsComplete, parseContent } from '../../../src/topics/formats';
import { needsMoreInfo, relevantExcerpts, makeSource, withoutSourceMentions } from '../../../src/topics/sources';
import { isOutlineDocument, looksLikeOutline, outlineFromText } from '../../../src/cpa/outline';

const lesson = (sections: unknown[]) => JSON.stringify({ sections, keyPoints: ['a'] });

describe('lesson text', () => {
  it('keeps paragraph breaks and bold marks', () => {
    const c: any = parseContent('lesson', lesson([{ heading: 'H', text: 'A **lease** is a contract.\n\n\n\nThe lessee pays.' }]));
    expect(c.sections[0].text).toBe('A **lease** is a contract.\n\nThe lessee pays.');
  });
  it('drops an example that asks a question and never answers it, and keeps a worked one', () => {
    expect(exampleIsComplete('What is the present value of $100 in 2 years at 5%?')).toBe(false);
    expect(exampleIsComplete('What is 100 / 1.05^2? Answer: $90.70')).toBe(true);
    const c: any = parseContent('lesson', lesson([{ heading: 'H', text: 'Text.', example: 'Calculate the interest on $1,000 at 5%.' }]));
    expect(c.sections[0].example).toBeUndefined();
  });
  it('asks for bold terms, spaced paragraphs, answered examples, and no source names in the text', () => {
    const m = contentMessages({ courseTitle: 'C', topic: 'Leases', level: 'x', how: '', style: '', square: { key: 's1', format: 'lesson', title: 'Leases', focus: 'f', unit: 'u' }, before: [], minutes: 10, excerpts: [{ source: 'Book', text: 'T' }] } as any);
    expect(m.user).toMatch(/double asterisks/);
    expect(m.user).toMatch(/never a question left unanswered/);
    expect(m.user).toMatch(/do not name the source/);
  });
  it('takes source names out of the reading', () => {
    expect(withoutSourceMentions('A lease is a contract [Intermediate Accounting]. See (Source: Pub 17) too.', ['Intermediate Accounting.pdf'])).toBe('A lease is a contract. See too.');
  });
  it('links an excerpt to the web page it came from', () => {
    const src = makeSource({ title: 'Leases explained', kind: 'web', url: 'https://example.org/leases', text: 'A lease transfers the right to use an asset. The lessee records a right-of-use asset and a lease liability.' }, 'x');
    expect(relevantExcerpts([src], 'lease right-of-use asset')[0].url).toBe('https://example.org/leases');
    expect(needsMoreInfo([])).toBe(true);
  });
});

describe('the exam blueprint', () => {
  const prose = Array.from({ length: 12 }, (_, i) => `Under ASC 842 a lessee recognises a right-of-use asset for lease number ${i} at the commencement date.`).join('\n');
  it('does not treat study text as an outline, and does not use the blueprint file as lesson text', async () => {
    expect(looksLikeOutline(prose)).toBe(false);
    expect(await outlineFromText(prose, async () => '{"areas":[{"area":"Invented","topics":["Made up"]}]}')).toEqual([]);
    expect(isOutlineDocument('AICPA FAR Blueprint 2025.pdf')).toBe(true);
    expect(isOutlineDocument('CPA_2027_FAR_Study_Pack.zip')).toBe(false);
  });
  it('keeps only topics the outline file really contains', async () => {
    const outline = 'FAR Blueprint\nArea I: Financial statements:\nBalance sheet\nCash flows\nArea II: Transactions:\nLeases\nRevenue\nArea III: Governments:\nFund statements\nPension plans';
    const areas = await outlineFromText(outline, async () => '{"areas":[{"area":"Area II","topics":["Leases","Quantum accounting"]}]}');
    expect(areas.flatMap((a) => a.topics)).toEqual(expect.arrayContaining(['Leases']));
    expect(areas.flatMap((a) => a.topics)).not.toContain('Quantum accounting');
  });
});
