import { followUpQuery, needsContext } from '../../../src/services/rag/followUp';

const chat = (...texts: string[]) => texts.map((content, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content }));

describe('searching documents with a follow-up question', () => {
  it('knows which questions cannot be searched alone', () => {
    expect(needsContext('What about 2024?')).toBe(true);
    expect(needsContext('and the penalty?')).toBe(true);
    expect(needsContext('why?')).toBe(true);
    expect(needsContext('What is the standard deduction for a single filer?')).toBe(false);
  });

  it('adds the previous user question to a follow-up, and leaves a full question alone', () => {
    const messages = chat('What is the standard deduction for a single filer in 2023?', 'It is 13,850 dollars.', 'What about 2024?');
    expect(followUpQuery('What about 2024?', messages)).toBe('What is the standard deduction for a single filer in 2023? What about 2024?');
    expect(followUpQuery('What is the penalty for filing late?', chat('anything', 'reply', 'What is the penalty for filing late?'))).toBe('What is the penalty for filing late?');
  });

  it('works whether or not the current question is already in the history, and with no history', () => {
    const earlier = chat('How are dividends taxed for a single filer?', 'It depends.');
    expect(followUpQuery('and for a married couple?', earlier)).toBe('How are dividends taxed for a single filer? and for a married couple?');
    expect(followUpQuery('and for a married couple?', [])).toBe('and for a married couple?');
    expect(followUpQuery('and for a married couple?', chat('and for a married couple?'))).toBe('and for a married couple?');
    expect(followUpQuery('why?', undefined)).toBe('why?');
  });
});
