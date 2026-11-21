const mockAsk = jest.fn();
jest.mock('../../../src/study/engine', () => ({ ...jest.requireActual('../../../src/study/engine'), askModel: (...a: unknown[]) => mockAsk(...a) }));

import { deepenLesson, shouldDeepen } from '../../../src/topics/service';

const course: any = { title: 'Accounting', topic: 'Accounting', difficulty: 'beginner' };
const lesson: any = { kind: 'lesson', sections: [{ heading: 'Cash', text: 'Cash is money.', example: 'Cash: 500' }, { heading: 'Debts', text: 'Debts are owed.' }], keyPoints: ['k'] };
const LONG = ('Cash is the most liquid asset a business holds, and it is the first line of the balance sheet. ').repeat(6);

beforeEach(() => mockAsk.mockReset());

it('writes every section out at length, keeping headings, examples and key points', async () => {
  mockAsk.mockResolvedValue(LONG);
  const out: any = await deepenLesson(course, lesson, { title: '1 – Cash', excerpts: [] });
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
  const out: any = await deepenLesson(course, lesson, { title: '1 – Cash', excerpts: [] });
  expect(out.sections.map((s: any) => s.text)).toEqual(['Cash is money.', 'Debts are owed.']);
});

describe('when a reading is written in depth', () => {
  it('by default and when asked for, but not for a rewrite, an "Another look" lesson, or a course set to short', () => {
    expect(shouldDeepen({}, {})).toBe(true);
    expect(shouldDeepen({ readingDepth: 'deep' }, {})).toBe(true);
    expect(shouldDeepen({ readingDepth: 'standard' }, {})).toBe(false);
    expect(shouldDeepen({}, {}, 'shorter')).toBe(false);
    expect(shouldDeepen({}, { remedial: true })).toBe(false);
  });
});

describe('bounded deepening', () => {
  it('a section whose model call hangs keeps its short text, and later sections still get their turn', async () => {
    jest.useFakeTimers();
    try {
      mockAsk.mockImplementationOnce(() => new Promise(() => undefined)).mockResolvedValueOnce(LONG);
      const run = deepenLesson(course, lesson, { title: '1 – Cash', excerpts: [], sectionMs: 1000, totalMs: 60_000 });
      await jest.advanceTimersByTimeAsync(1001);
      const out: any = await run;
      expect(out.sections[0].text).toBe('Cash is money.');
      expect(out.sections[1].text.length).toBeGreaterThan(400);
    } finally { jest.useRealTimers(); }
  });

  it('stops asking once the total time is used up', async () => {
    mockAsk.mockResolvedValue(LONG);
    const out: any = await deepenLesson(course, lesson, { title: '1 – Cash', excerpts: [], totalMs: 0 });
    expect(mockAsk).not.toHaveBeenCalled();
    expect(out.sections.map((s: any) => s.text)).toEqual(['Cash is money.', 'Debts are owed.']);
  });

  it('gives up on the rest after repeated failures instead of making eight failing calls', async () => {
    const many = { ...lesson, sections: Array.from({ length: 6 }, (_, i) => ({ heading: `S${i}`, text: 'Short.' })) };
    mockAsk.mockRejectedValue(new Error('engine busy'));
    await deepenLesson(course, many, { title: 'x', excerpts: [] });
    expect(mockAsk).toHaveBeenCalledTimes(2);
  });
});
