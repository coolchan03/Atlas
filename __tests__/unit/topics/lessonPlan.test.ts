import { planLesson, sectionsPerCall, wholeSeconds, piecesSeconds } from '../../../src/topics/lessonPlan';

const fast = { decode: 30, prefill: 400 };
const slowWriter = { decode: 3, prefill: 60 }; // a big model on a phone
const slowReader = { decode: 6, prefill: 12 }; // reads slowly: every extra call costs a lot of waiting

describe('one call or pieces', () => {
  it('a model that writes a whole lesson in a safe time is asked once (fewest reads, fastest)', () => {
    const plan = planLesson(fast);
    expect(plan.mode).toBe('whole');
    expect(plan.wholeSeconds).toBeLessThan(plan.piecesSeconds); // and it really is the faster of the two
    expect(plan.why).toMatch(/also faster|safer/);
  });

  it('a model for which one call is too long to trust is split, and the plan says why', () => {
    const plan = planLesson(slowWriter);
    expect(plan.mode).toBe('pieces');
    expect(plan.wholeSeconds).toBeGreaterThan(8 * 60);
    expect(plan.why).toMatch(/too long to trust/);
  });

  it('nothing is split on a guess: with no measured speed the lesson is one call', () => {
    expect(planLesson({}).mode).toBe('whole');
    expect(planLesson({ decode: 0, prefill: 100 }).mode).toBe('whole');
  });

  it('a missing reading speed is assumed, not a reason to fail', () => {
    expect(planLesson({ decode: 3 }).mode).toBe('pieces');
  });

  it('on a model near the boundary, splitting is never presented as faster than it is', () => {
    const near = planLesson({ decode: 5, prefill: 60 });
    if (near.mode === 'whole') expect(near.wholeSeconds).toBeLessThanOrEqual(8 * 60);
    else expect(near.wholeSeconds).toBeGreaterThan(8 * 60);
  });
});

describe('how many sections per call', () => {
  it('splitting costs extra reading, so pieces are as large as stays safe, not as small as possible', () => {
    const k = sectionsPerCall(6, slowWriter);
    expect(k).toBeGreaterThanOrEqual(2);
    // the chosen size is the fastest among those whose pieces stay short
    const s = { decode: 3, prefill: 60 };
    expect(piecesSeconds(6, k, s)).toBeLessThanOrEqual(piecesSeconds(6, 1, s));
  });

  it('no safe size is faster than the one chosen (and among equals the most even split is taken)', () => {
    for (const sp of [slowWriter, slowReader, { decode: 6, prefill: 400 }, { decode: 10, prefill: 100 }]) {
      for (const sections of [4, 6, 7]) {
        const k = sectionsPerCall(sections, sp);
        const pieceTime = (n: number) => 1800 / sp.prefill + (n * 320) / sp.decode; // what planLesson assumes one piece costs
        if (k > 1) expect(pieceTime(k)).toBeLessThanOrEqual(300); // the chosen size is a safe length
        for (let other = 1; other <= sections; other++) {
          if (other > 1 && pieceTime(other) > 300) continue; // unsafe sizes are not candidates
          expect(piecesSeconds(sections, k, sp)).toBeLessThanOrEqual(piecesSeconds(sections, other, sp) + 1e-9);
        }
      }
    }
  });

  it('fewer calls win while pieces stay safe: six sections go in two or three calls on a model that can take it, not six', () => {
    const k = sectionsPerCall(6, { decode: 10, prefill: 100 });
    expect(Math.ceil(6 / k)).toBeLessThanOrEqual(2);
  });

  it('a model that reads slowly gets smaller pieces than one that reads fast, because reading eats the time each piece is allowed', () => {
    expect(sectionsPerCall(6, slowReader)).toBeLessThanOrEqual(sectionsPerCall(6, { decode: 6, prefill: 400 }));
  });

  it('every piece stays a safe length, down to one section at a time on a very slow writer', () => {
    expect(sectionsPerCall(6, { decode: 1, prefill: 60 })).toBe(1);
    const k = sectionsPerCall(6, slowWriter);
    expect(piecesSeconds(k, k, { decode: 3, prefill: 60 })).toBeLessThan(10 * 60); // sanity: pieces are minutes, not a quarter of an hour
  });

  it('handles tiny outlines and no speed', () => {
    expect(sectionsPerCall(1, slowWriter)).toBe(1);
    expect(sectionsPerCall(2, slowWriter)).toBeLessThanOrEqual(2);
    expect(sectionsPerCall(7, {})).toBe(7);
  });

  it('estimates grow with the number of sections', () => {
    const s = { decode: 6, prefill: 60 };
    expect(wholeSeconds(8, s)).toBeGreaterThan(wholeSeconds(4, s));
    expect(piecesSeconds(8, 2, s)).toBeGreaterThan(piecesSeconds(4, 2, s));
  });
});
