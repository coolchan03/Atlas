import { courseToFile, parseCourseFile, validContent, MAX_COURSE_FILE_CHARS } from '../../../src/topics/shareCourse';

const sq = (key: string, format = 'lesson') => ({ key, format, title: `Title ${key}`, focus: 'f', unit: 'U' });
const base = (extra: Record<string, unknown> = {}) => ({ atlasCourse: 1, title: 'T', topic: 'Topic', squares: [sq('a'), sq('b', 'quiz')], content: {}, ...extra });
const parse = (o: unknown) => parseCourseFile(JSON.stringify(o));

describe('validContent checks each kind', () => {
  const good: Record<string, unknown> = {
    lesson: { kind: 'lesson', sections: [{ text: 'x' }] },
    quiz: { kind: 'quiz', questions: [{ q: 'q', options: ['a', 'b'], answer: 1 }] },
    cards: { kind: 'cards', cards: [{ front: 'f', back: 'b' }] },
    match: { kind: 'match', pairs: [{ left: 'l', right: 'r' }] },
    order: { kind: 'order', steps: ['a', 'b'] },
    practice: { kind: 'practice', task: 't', model: 'm', rubric: [] },
    numeric: { kind: 'numeric', task: 't', answer: 3, tolerance: 0.1, working: [] },
    worked: { kind: 'worked', problem: 'p', steps: [{ step: 'a' }, { step: 'b' }] },
    table: { kind: 'table', markdown: '|a|' },
    typed: { kind: 'typed', items: [{ prompt: 'p', answer: 'a', alternatives: [] }] },
    tablefill: { kind: 'tablefill', columns: ['a', 'b'], rows: ['r', 's'], answers: [['1'], ['2']] },
    sort: { kind: 'sort', groups: ['g', 'h'], items: [0, 1, 0, 1].map((group, i) => ({ text: `t${i}`, group })) },
    dictation: { kind: 'dictation', sentences: ['a', 'b', 'c'] },
  };
  it.each(Object.keys(good))('accepts a good %s', (k) => expect(validContent(good[k])).toBe(true));
  const bad: Record<string, unknown> = {
    lesson: { kind: 'lesson', sections: [] }, quiz: { kind: 'quiz', questions: [{ q: 'q', options: ['a'], answer: 3 }] },
    cards: { kind: 'cards', cards: [{ front: 1 }] }, match: { kind: 'match', pairs: [] }, order: { kind: 'order', steps: [1] },
    practice: { kind: 'practice', task: 't' }, numeric: { kind: 'numeric', task: 't', answer: NaN, tolerance: 1, working: [] },
    worked: { kind: 'worked', problem: 'p', steps: [{ step: 'a' }] }, table: { kind: 'table' }, typed: { kind: 'typed', items: [{ prompt: 'p' }] },
    tablefill: { kind: 'tablefill', columns: ['a', 'b'], rows: ['r', 's'], answers: [['1']] },
    sort: { kind: 'sort', groups: ['g', 'h'], items: [{ text: 'a', group: 9 }, { text: 'b', group: 0 }, { text: 'c', group: 0 }, { text: 'd', group: 0 }] },
    dictation: { kind: 'dictation', sentences: ['a'] },
  };
  it.each(Object.keys(bad))('rejects a bad %s', (k) => expect(validContent(bad[k])).toBe(false));
  it('rejects unknown kinds, null and inherited names', () => {
    expect(validContent(null)).toBe(false);
    expect(validContent({ kind: 'toString' })).toBe(false);
    expect(validContent('x')).toBe(false);
  });
});

describe('parseCourseFile', () => {
  it('reads a good course and keeps only valid content', () => {
    const c = parse(base({ content: { a: good(), b: { kind: 'quiz' }, zzz: good() }, sources: [{ title: 'S', kind: 'note', text: 'hi' }, { title: '' }, null], request: { goal: 'g', minutes: 20 } }));
    expect(Object.keys(c.content)).toEqual(['a']);
    expect(c.sources).toHaveLength(1);
    expect(c.title).toBe('T');
  });
  it('fills defaults', () => {
    const c = parse({ atlasCourse: 1, squares: [sq('a'), sq('b')] } as never);
    expect(c.title).toBe('Shared course');
    expect(c.request.level).toBe('Complete beginner');
  });
  it('refuses bad input with readable messages', () => {
    expect(() => parseCourseFile('x'.repeat(MAX_COURSE_FILE_CHARS + 1))).toThrow('too big');
    expect(() => parseCourseFile('{nope')).toThrow('not an Atlas');
    expect(() => parse({ atlasCourse: 2, squares: [] })).toThrow('not an Atlas');
    expect(() => parse(base({ squares: [sq('a')] }))).toThrow('no squares');
    expect(() => parse(base({ squares: [sq('a'), { ...sq('b'), key: 'bad key!' }, { ...sq('c'), format: 'nope' }, { ...sq('d'), title: '' }] }))).toThrow('no squares');
  });
  it('drops web page text when a course is written to a file', () => {
    const course: any = { title: 'T', topic: 't', summary: '', style: '', theme: '', request: {}, squares: [sq('a'), sq('b')], content: {}, sources: [{ title: 'w', kind: 'web', url: 'u', text: 'SECRET' }, { title: 'n', kind: 'note', text: 'mine' }] };
    const out = JSON.parse(courseToFile(course));
    expect(out.sources[0].text).toBe('');
    expect(out.sources[1].text).toBe('mine');
    expect(JSON.parse(courseToFile({ ...course, sources: undefined })).sources).toEqual([]);
  });
});
function good() { return { kind: 'lesson', sections: [{ text: 'x' }] }; }
