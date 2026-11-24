import { digestText, fitsWhole, groundNotes, MAX_PARTS, salientSentences, splitIntoParts } from '../../src/workflows/longText';

describe('splitIntoParts', () => {
  it('cuts between paragraphs, keeps every word once, and never makes a part longer than the size', () => {
    const paragraphs = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} ${'word '.repeat(60)}`.trim());
    const parts = splitIntoParts(paragraphs.join('\n\n'), 1000);
    expect(parts.length).toBeGreaterThan(5);
    parts.forEach((p) => expect(p.length).toBeLessThanOrEqual(1000));
    expect(parts.join(' ').match(/Paragraph \d+/g)).toEqual(paragraphs.map((p) => p.match(/Paragraph \d+/)![0])); // in order, none lost, none repeated
    parts.slice(0, -1).forEach((p) => expect(p).toMatch(/word$/)); // each part ends where a paragraph ends
  });

  it('cuts one huge paragraph between sentences, and a single endless sentence anywhere', () => {
    const sentences = Array.from({ length: 50 }, (_, i) => `Sentence number ${i} says something.`).join(' ');
    const parts = splitIntoParts(sentences, 300);
    parts.forEach((p) => { expect(p.length).toBeLessThanOrEqual(300); expect(p).toMatch(/\.$/); });
    expect(splitIntoParts('x'.repeat(2500), 1000).map((p) => p.length)).toEqual([1000, 1000, 500]);
    expect(splitIntoParts('   ', 100)).toEqual([]);
  });
});

describe('checking a small model\'s notes', () => {
  const part = 'Budget: Sam reported the project is 8 percent under budget. DECISION: we ship the release on Friday 5 December. Maria will send the invoice to Acme by Monday 1 December.';

  it('keeps notes the part can back up, and drops invented names and numbers, repeats and bare labels', () => {
    const notes = [
      'Decisions:', '- Ship the release on Friday 5 December.', '- Sarah will lead the launch.', '- Maria sends the invoice to Acme by Monday 1 December.',
      '- Maria sends the invoice to Acme by Monday 1 December.', '1. The project is 12 percent over budget.', 'Action:', '- Sam reports on the budget.',
    ].join('\n');
    expect(groundNotes(notes, part)).toEqual(['Ship the release on Friday 5 December.', 'Maria sends the invoice to Acme by Monday 1 December.', 'Sam reports on the budget.']);
    expect(groundNotes('Nothing useful', part)).toEqual(['Nothing useful']);
    expect(groundNotes('x'.repeat(400), part)).toEqual([]);
  });

  it('picks the sentences with numbers, dates and words of decision or action when the model gave nothing, in their order', () => {
    expect(salientSentences(part, 2)).toEqual(['DECISION: we ship the release on Friday 5 December.', 'Maria will send the invoice to Acme by Monday 1 December.']);
    expect(salientSentences('The sky was grey. The grass was green.')).toEqual(['The sky was grey.']); // nothing stands out: the first sentence
    expect(salientSentences('')).toEqual([]);
  });
});

describe('digestText', () => {
  const budget = 5000;
  const text = Array.from({ length: 30 }, (_, i) => (i === 14 ? 'DECISION: we ship on Friday 5 December. Maria will send the invoice by Monday. ' : 'We talked about the plan and the weather. ') + 'word '.repeat(200)).join('\n\n');

  it('hands a text that fits back untouched, without asking anything', async () => {
    const ask = jest.fn();
    expect(await digestText('a job', 'a short text', { ask, budget })).toBe('a short text');
    expect(fitsWhole('a short text', budget)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it('reads every part with the job in mind and keeps the notes that hold up, so a decision in the middle is not lost', async () => {
    const labels: string[] = [];
    const ask = async (_s: string, user: string, label: string) => { labels.push(label); return /DECISION/.test(user) ? '- Sarah decided to ship.\n- We ship on Friday 5 December.' : '- The part talks about the plan.'; };
    const digest = await digestText('find the decision', text, { ask, budget });
    expect(labels[0]).toMatch(/^Reading part 1 of \d+$/);
    expect(labels.length).toBeGreaterThan(8);
    expect(digest).toMatch(/We ship on Friday 5 December/);
    expect(digest).not.toMatch(/Sarah/); // an invented name is dropped
    expect(digest.length).toBeLessThanOrEqual(Math.round(budget * 0.55) + 80);
  });

  it('still keeps the telling sentences of a part when the model says there is nothing', async () => {
    const digest = await digestText('find the decision', text, { ask: async () => 'Nothing here', budget });
    expect(digest).toMatch(/DECISION: we ship on Friday 5 December/);
  });

  it('reads the notes again when they are still too long', async () => {
    const labels: string[] = [];
    const ask = async (_s: string, _u: string, label: string) => { labels.push(label); return ['plan', 'weather', 'room', 'coffee'].map((w) => `- The part talks about the ${w} and what everybody said about it over the course of the morning.`).join('\n'); };
    const digest = await digestText('job', text, { ask, budget });
    expect(labels.filter((l) => /^Reading part 1 of/.test(l))).toHaveLength(2); // a second round read the first round's notes
    expect(digest.length).toBeLessThanOrEqual(Math.round(budget * 0.55) + 80);
  });

  it('says plainly when a text is too long to read', async () => {
    const huge = 'sentence here. '.repeat(Math.ceil((MAX_PARTS + 5) * budget * 0.55 / 15));
    await expect(digestText('job', huge, { ask: async () => 'x', budget })).rejects.toThrow(/too long to read in one go/);
  });
});
