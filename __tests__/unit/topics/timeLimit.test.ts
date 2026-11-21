import { callLimitMs } from '../../../src/topics/timeLimit';

describe('how long a lesson call may take', () => {
  it('is the base four minutes on a fast model, longer on a slow one, and never past half an hour', () => {
    expect(callLimitMs({ decode: 30, prefill: 400, outLen: 0 })).toBe(4 * 60 * 1000);
    const slow = callLimitMs({ decode: 3, prefill: 30, outLen: 0 });
    expect(slow).toBeGreaterThan(15 * 60 * 1000);
    expect(slow).toBeLessThanOrEqual(30 * 60 * 1000);
    expect(callLimitMs({ decode: 0.2, prefill: 5, outLen: 0 })).toBe(30 * 60 * 1000);
    expect(callLimitMs(undefined)).toBeGreaterThan(4 * 60 * 1000 - 1);
  });
});
