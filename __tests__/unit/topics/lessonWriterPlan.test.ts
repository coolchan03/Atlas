import { writeLessonInPieces, type LessonIO } from '../../../src/topics/lessonWriter';
import { sectionsPerCall } from '../../../src/topics/lessonPlan';

const base: any = { courseTitle: 'Accounting', topic: 'Leases', level: 'beginner', how: 'plain', style: 'plain', square: { key: 's1', format: 'lesson', title: 'Leases', focus: 'leases', unit: 'U' }, before: [], minutes: 20, difficulty: 'normal' };
const outlineOf = (n: number) => JSON.stringify({ sections: Array.from({ length: n }, (_, i) => ({ heading: `Section ${i + 1}`, focus: `about ${i + 1}` })) });
const part = (headings: string[]) => JSON.stringify({ sections: headings.map((h) => ({ heading: h, text: `Text of ${h}. `.repeat(20) })) });

/** A model that answers by what it is asked: the outline, the sections named in the prompt, or the key points. */
function fakeIO(sections: number) {
  const calls: string[] = [];
  const saved: number[] = [];
  const io: LessonIO = {
    ask: async (prompt, read, how) => {
      const text = `${prompt.system}\n${prompt.user}`;
      calls.push(how.what);
      let raw: string;
      if (/outline of the lesson/.test(how.what)) raw = outlineOf(sections);
      else if (/key points/.test(how.what)) raw = JSON.stringify({ keyPoints: ['a', 'b', 'c'], quickCheck: { q: 'q?', a: 'a' } });
      else { const wanted = [...text.matchAll(/ONLY (?:this section|these sections): ([^\n]*?)\. Do not repeat/g)][0]?.[1] ?? ''; raw = part([...wanted.matchAll(/"(Section \d+)"/g)].map((m) => m[1])); }
      const out = read(raw);
      if (out === null) throw new Error('unreadable');
      return out;
    },
    save: (lesson) => saved.push(lesson.sections.length),
    discard: () => undefined,
    stopped: () => false,
  };
  return { io, calls, saved };
}

describe('how many calls a lesson written in pieces makes', () => {
  it('with no speed known it keeps the old two sections per call', async () => {
    const { io, calls } = fakeIO(6);
    const lesson = await writeLessonInPieces(base, io);
    expect(calls.filter((c) => /^the sections/.test(c))).toHaveLength(3);
    expect(lesson.sections).toHaveLength(6);
  });

  it('with measured speeds it uses the sections per call the plan chose, and still writes every section once, in order', async () => {
    const speeds = { decode: 10, prefill: 100 };
    const perCall = sectionsPerCall(6, speeds);
    const { io, calls } = fakeIO(6);
    const lesson = await writeLessonInPieces(base, io, speeds);
    expect(calls.filter((c) => /^the sections/.test(c))).toHaveLength(Math.ceil(6 / perCall));
    expect(lesson.sections.map((s) => s.heading)).toEqual(Array.from({ length: 6 }, (_, i) => `Section ${i + 1}`));
    expect(lesson.keyPoints).toEqual(['a', 'b', 'c']);
  });

  it('a model that must go one section at a time still finishes the whole lesson', async () => {
    const { io, calls } = fakeIO(5);
    const lesson = await writeLessonInPieces(base, io, { decode: 1, prefill: 60 });
    expect(calls.filter((c) => /^the sections/.test(c))).toHaveLength(5);
    expect(lesson.sections).toHaveLength(5);
  });

  it('fewer, larger calls than before on a model that can take them (less re-reading)', async () => {
    const a = fakeIO(6); await writeLessonInPieces(base, a.io); // the old rule
    const b = fakeIO(6); await writeLessonInPieces(base, b.io, { decode: 10, prefill: 100 });
    expect(b.calls.length).toBeLessThanOrEqual(a.calls.length);
  });

  it('is kept as it grows: the lesson is saved after every piece', async () => {
    const { io, saved } = fakeIO(6);
    await writeLessonInPieces(base, io, { decode: 3, prefill: 60 });
    expect(saved.length).toBeGreaterThan(1);
    expect(saved).toEqual([...saved].sort((x, y) => x - y)); // it only grows
    expect(saved[saved.length - 1]).toBe(6);
  });
});
