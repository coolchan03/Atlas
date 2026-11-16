const mockAsk = jest.fn();
jest.mock('../../../src/study/engine', () => ({ ...jest.requireActual('../../../src/study/engine'), askModel: (...a: unknown[]) => mockAsk(...a) }));

import { deepenLesson } from '../../../src/topics/service';

const course: any = { title: 'Accounting', topic: 'Accounting', difficulty: 'beginner' };
const lesson: any = { kind: 'lesson', sections: [{ heading: 'Cash', text: 'Cash is money.', example: 'Cash: 500' }, { heading: 'Debts', text: 'Debts are owed.' }], keyPoints: ['k'] };
const LONG = ('Cash is the most liquid asset a business holds, and it is the first line of the balance sheet. ').repeat(6);

beforeEach(() => mockAsk.mockReset());

it('writes every section out at length, keeping headings, examples and key points', async () => {
  mockAsk.mockResolvedValue(LONG);
  const out: any = await deepenLesson(course, '1 – Cash', lesson, []);
  expect(mockAsk).toHaveBeenCalledTimes(2);
  expect(out.sections.map((s: any) => s.heading)).toEqual(['Cash', 'Debts']);
  expect(out.sections[0].text.length).toBeGreaterThan(400);
  expect(out.sections[0].example).toBe('Cash: 500');
  expect(out.keyPoints).toEqual(['k']);
  // Each section is asked for on its own, told what the other sections are so it does not repeat them.
  expect(mockAsk.mock.calls[0][1]).toContain('Debts');
});

it('keeps the short version of a section the model could not lengthen, or failed on', async () => {
  mockAsk.mockResolvedValueOnce('Too short.').mockRejectedValueOnce(new Error('out of memory'));
  const out: any = await deepenLesson(course, '1 – Cash', lesson, []);
  expect(out.sections.map((s: any) => s.text)).toEqual(['Cash is money.', 'Debts are owed.']);
});
