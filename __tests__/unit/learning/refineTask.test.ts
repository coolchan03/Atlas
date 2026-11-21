import { parseRefined, refineMessages, refineTask } from '../../../src/learning/refineTask';

it('strips labels, quotes and markdown from the suggestion, and refuses an empty one', () => {
  expect(parseRefined('```\nTask: "Become expert at lease accounting under ASC 842, including the lessee and lessor sides."\n```')).toBe('Become expert at lease accounting under ASC 842, including the lessee and lessor sides.');
  expect(parseRefined('ok')).toBeNull();
  expect(parseRefined('<think>hmm</think>Learn basis rules for property transactions and how gains are worked out.')).toMatch(/^Learn basis rules/);
});

it('asks with the rough task, the project and the rules for a good task, and throws a readable error when the answer is unusable', async () => {
  expect(refineMessages('tax', { project: 'REG books' }).user).toContain('project "REG books"');
  expect(await refineTask('tax', async () => 'Become expert at federal income tax for individuals, from filing status to credits.')).toContain('federal income tax');
  await expect(refineTask('tax', async () => 'no')).rejects.toThrow(/usable task/);
});
