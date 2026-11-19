import { parseChange } from '../../src/topics/boardEdit';

const course = { squares: [{ key: 's1', format: 'lesson', title: 'A', focus: '', unit: 'U' }, { key: 's2', format: 'quiz', title: 'B', focus: '', unit: 'U' }], progress: { s1: { stars: 3 } } } as any;

it('keeps only real keys and kinds, and never removes a played square', () => {
  const c = parseChange('Sure: {"remove":["s1","s2","zzz"],"add":[{"after":"s2","format":"crossword","title":"Terms","focus":"x"},{"after":"nope","format":"quiz","title":"Bad"},{"after":"s1","format":"banana","title":"Bad"}]}', course);
  expect(c).toEqual({ remove: ['s2'], add: [{ afterKey: 's2', format: 'crossword', title: 'Terms', focus: 'x' }] });
  expect(parseChange('no json', course)).toBeNull();
});

it('shows a big board by the chapters the request names, and says it is partial', () => {
  const { editBoard } = require('../../src/topics/boardEdit');
  const { useTopics } = require('../../src/topics/store');
  const squares = Array.from({ length: 600 }, (_, i) => ({ key: `s${i + 1}`, format: 'lesson', title: `Topic number ${i} of the long book`, focus: '', unit: i > 590 ? 'Leases' : `Chapter ${Math.floor(i / 6)}` }));
  useTopics.setState({ courses: [{ id: 'big', topic: 't', title: 'T', summary: '', style: '', theme: '', request: {}, squares, content: {}, progress: {}, createdAt: 1, sources: [] }] });
  jest.doMock('../../src/study/engine', () => ({ askModel: async (_s: string, u: string) => { (global as any).__prompt = u; return '{"remove":["s600"],"add":[]}'; } }));
  jest.resetModules();
  const { editBoard: fresh } = require('../../src/topics/boardEdit');
  const { useTopics: store } = require('../../src/topics/store');
  store.setState({ courses: [{ id: 'big', topic: 't', title: 'T', summary: '', style: '', theme: '', request: {}, squares, content: {}, progress: {}, createdAt: 1, sources: [] }] });
  return fresh('big', 'remove the leases quiz').then((r: any) => {
    expect((global as any).__prompt).toMatch(/s600 \|/);
    expect(r).toEqual({ added: 0, removed: 1, partial: true });
    expect(editBoard).toBeDefined();
  });
});
