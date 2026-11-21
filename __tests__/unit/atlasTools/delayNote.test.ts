import { explainDelay, SLOW_FIRST_WORD_SEC, SLOW_WRITING_TPS } from '../../../src/atlasTools/delayNote';

describe('explaining a slow reply in plain words', () => {
  it('says nothing for a normal reply, or when nothing is known', () => {
    expect(explainDelay({ timeToFirstToken: 1.2, decodeTokensPerSecond: 12 })).toBeNull();
    expect(explainDelay({})).toBeNull();
    expect(explainDelay(undefined)).toBeNull();
  });

  it('explains a long wait for the first word, with seconds as the unit', () => {
    const note = explainDelay({ timeToFirstToken: SLOW_FIRST_WORD_SEC + 4, decodeTokensPerSecond: 10 });
    expect(note).toMatch(/^It took 12 s to start answering/);
    expect(note).toContain('A new chat');
    expect(note).not.toContain('words a minute');
  });

  it('explains slow writing in words a minute, and names what is faster', () => {
    const note = explainDelay({ timeToFirstToken: 2, decodeTokensPerSecond: 2 });
    expect(note).toContain('about 90 words a minute');
    expect(note).toContain('Quick mode');
    expect(explainDelay({ decodeTokensPerSecond: SLOW_WRITING_TPS })).toBeNull(); // at the limit is not slow
  });

  it('explains both when both were slow', () => {
    expect(explainDelay({ timeToFirstToken: 20, decodeTokensPerSecond: 1 })).toMatch(/start answering.*words a minute/);
  });

  it('does not call writing slow from a figure that includes the wait (decode speed only)', () => {
    expect(explainDelay({ timeToFirstToken: 9, tokensPerSecond: 1 } as any)).toMatch(/start answering/);
    expect(explainDelay({ timeToFirstToken: 9, tokensPerSecond: 1 } as any)).not.toContain('words a minute');
  });
});
