import { parseChange } from '../../src/topics/boardEdit';

const course = { squares: [{ key: 's1', format: 'lesson', title: 'A', focus: '', unit: 'U' }, { key: 's2', format: 'quiz', title: 'B', focus: '', unit: 'U' }], progress: { s1: { stars: 3 } } } as any;

it('keeps only real keys and kinds, and never removes a played square', () => {
  const c = parseChange('Sure: {"remove":["s1","s2","zzz"],"add":[{"after":"s2","format":"crossword","title":"Terms","focus":"x"},{"after":"nope","format":"quiz","title":"Bad"},{"after":"s1","format":"banana","title":"Bad"}]}', course);
  expect(c).toEqual({ remove: ['s2'], add: [{ afterKey: 's2', format: 'crossword', title: 'Terms', focus: 'x' }] });
  expect(parseChange('no json', course)).toBeNull();
});
