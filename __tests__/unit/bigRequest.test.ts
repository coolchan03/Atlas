import { severalParts, wantsSteps } from '../../src/workflows/bigRequest';

describe('which chat messages are done in steps', () => {
  it('does a message that asks for several things, or says it wants steps, or is long next to the model\'s memory', () => {
    expect(wantsSteps('Summarise this article about the office, then list the main actions and write a short email to my team about them. It says the office moves on the first of March.', 4096)).toBe(true);
    expect(wantsSteps(`Please do this step by step for me: ${'details '.repeat(25)}`, 4096)).toBe(true);
    expect(wantsSteps(`Here is my report. ${'It covers the quarter in some detail. '.repeat(120)}`, 4096)).toBe(true); // over a third of 4,096 tokens
    expect(wantsSteps(`Here is a long text. ${'It covers the quarter in some detail. '.repeat(40)}`, 32768)).toBe(false); // plenty of room: just one thing asked
  });

  it('leaves a short message alone however many words of asking it has, and a plain question', () => {
    expect(wantsSteps('List, write and summarise.', 4096)).toBe(false); // under 160 characters
    expect(wantsSteps('What is the capital of France, and why did it become the capital? Give me a detailed answer with some history and a few interesting facts about the city.', 4096)).toBe(false);
    expect(severalParts('Write me a haiku')).toBe(false);
  });
});
