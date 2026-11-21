/** "Write squares now": the next few, or a whole chapter, are written straight away; one that fails is skipped and listed, not the end of the batch. Only the AI is faked. */
export {};

const mockAsked: string[] = [];
let mockFailFor = '';
jest.mock('../../src/study/engine', () => ({
  askModel: jest.fn(async (_system: string, user: string) => {
    mockAsked.push(user);
    if (mockFailFor && user.includes(mockFailFor)) throw new Error('The model is not loaded');
    return JSON.stringify({ sections: [{ heading: 'h', text: 't' }], keyPoints: ['k'] });
  }),
  gatherSources: jest.fn(async () => []),
}));

function course() {
  jest.resetModules();
  mockAsked.length = 0; mockFailFor = '';
  require('../../src/atlasTools/offGridState').useOffGrid.setState({ on: true });
  const { useTopics } = require('../../src/topics/store');
  const squares = [
    ...[1, 2, 3].map((i) => ({ key: `a${i}`, format: 'lesson', title: `Alpha ${i}`, focus: `about alpha ${i}`, unit: 'Chapter 1: Alpha' })),
    ...[1, 2, 3].map((i) => ({ key: `b${i}`, format: 'lesson', title: `Beta ${i}`, focus: `about beta ${i}`, unit: 'Chapter 2: Beta' })),
  ];
  const id = useTopics.getState().add({ topic: 'T', goal: '', level: 'Complete beginner', how: '', minutes: 10 }, { title: 'T', summary: '', style: '', theme: '', squares });
  // These tests count the model's calls, one per lesson: the short reading is one call (the in-depth reading is tested in deepenLesson.test).
  useTopics.getState().setReadingDepth(id, 'standard');
  return { id, useTopics, prepare: require('../../src/topics/prepare') };
}

it('writes squares now, and lists the chapters with how many are written', async () => {
  const { id, useTopics, prepare } = course();
  const get = () => useTopics.getState().courses.find((c: { id: string }) => c.id === id);
  const four = prepare.missingAll(get()).slice(0, 4);
  expect(four).toEqual(['a1', 'a2', 'a3', 'b1']);
  expect(await prepare.writeNow(id, four, 'four squares')).toBe(4);
  expect(Object.keys(get().content).sort()).toEqual(['a1', 'a2', 'a3', 'b1']);
  expect(prepare.unitsOf(get())).toEqual([{ unit: 'Chapter 1: Alpha', total: 3, written: 3 }, { unit: 'Chapter 2: Beta', total: 3, written: 1 }]);
  expect(prepare.useBatch.getState()).toMatchObject({ total: 4, done: 4, failed: [] });
  expect(mockAsked).toHaveLength(4); // one request to the AI for each square
});

it('writes a whole chapter on request, and skips a square that cannot be written instead of stopping', async () => {
  const { id, useTopics, prepare } = course();
  const get = () => useTopics.getState().courses.find((c: { id: string }) => c.id === id);
  mockFailFor = 'about beta 2';
  expect(prepare.missingInUnit(get(), 'Chapter 2: Beta')).toEqual(['b1', 'b2', 'b3']);
  expect(await prepare.writeNow(id, prepare.missingInUnit(get(), 'Chapter 2: Beta'), 'Chapter 2: Beta')).toBe(2);
  expect(Object.keys(get().content).sort()).toEqual(['b1', 'b3']);
  expect(prepare.useBatch.getState()).toMatchObject({ failed: ['b2'], error: 'The model is not loaded', done: 3 });
});
