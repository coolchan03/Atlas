import { scrubTeasers, withoutTeasers, withoutLeadIn } from '../../src/atlasTools/briefingScrub';

describe('teasers the model makes up', () => {
  it.each([
    ['Officials said the bridge reopens Monday. Next, we will see what else is making headlines this morning.', 'Officials said the bridge reopens Monday.'],
    ['Prices rose two percent. We will elaborate on this story in a moment.', 'Prices rose two percent.'],
    ['The storm hit the coast. You can watch a video of it after the news briefing.', 'The storm hit the coast.'],
    ['The vote passed. Stay tuned for more.', 'The vote passed.'],
    ['The team won 3-1. I\'ll tell you more about it later.', 'The team won 3-1.'],
  ])('removes the sentence from %s', (text, want) => { expect(withoutTeasers(text)).toBe(want); });

  it('keeps ordinary sentences, including ones that start with Next or mention a video as news', () => {
    expect(withoutTeasers('Next, the council approved the budget.')).toBe('Next, the council approved the budget.');
    expect(withoutTeasers('The video of the rescue has been viewed a million times.')).toBe('The video of the rescue has been viewed a million times.');
  });

  it('drops a line that was only a teaser and moves the story starts with the lines', () => {
    const lines = [{ text: 'Story one is here.' }, { text: 'Next we will see what else is making headlines this morning.' }, { text: 'Story two begins.' }, { text: 'It continues.' }];
    const out = scrubTeasers(lines, [2]);
    expect(out.lines.map((l) => l.text)).toEqual(['Story one is here.', 'Story two begins.', 'It continues.']);
    expect(out.starts).toEqual([1]);
    expect(out.removed).toBe(1);
    expect(scrubTeasers([{ text: 'Only a teaser: stay tuned.' }, { text: 'Real story.' }], [1]).starts).toEqual([0]);
  });
});

describe('lines that open with the report instead of the news', () => {
  it('tells the news directly', () => {
    expect(withoutLeadIn('The report details how these groups are assisting families across North Texas.')).toBe('These groups are assisting families across North Texas.');
    expect(withoutLeadIn('The article notes that prices rose. The council met on Monday.')).toBe('Prices rose. The council met on Monday.');
  });
  it('leaves a sentence that has no clause after it', () => {
    expect(withoutLeadIn('The report highlights the responsibilities of the captain.')).toBe('The report highlights the responsibilities of the captain.');
  });
});

describe('scrub keeps real news', () => {
  it('leaves decimals, abbreviations and findings alone', () => {
    for (const t of ['Inflation rose 2.5 percent in the U.S. last month.', 'Researchers find a link between sleep and memory.', 'Police arrested two men after the break-in on Monday.']) {
      expect(withoutTeasers(t)).toBe(t);
    }
  });
});
