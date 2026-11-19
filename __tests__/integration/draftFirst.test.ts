/** A lesson's first pass is saved and shown at once; the optional in-depth rewrite runs after, can hang or fail, and never removes the draft. Only the AI is faked. */
export {};

let mockCalls = 0;
let mockHangAfterFirst = false;
jest.mock('../../src/study/engine', () => ({
  askModel: jest.fn(async () => {
    mockCalls += 1;
    if (mockCalls === 1) return JSON.stringify({ sections: [{ heading: 'Cash', text: 'Cash is money.' }], keyPoints: ['k'] });
    if (mockHangAfterFirst) return new Promise(() => undefined);
    return 'Cash is the most liquid asset a business holds, and it is the first line of the balance sheet. '.repeat(6);
  }),
  gatherSources: jest.fn(async () => []),
}));

const setup = () => {
  jest.resetModules(); mockCalls = 0;
  require('../../src/atlasTools/offGridState').useOffGrid.setState({ on: true });
  const { useTopics } = require('../../src/topics/store');
  const id = useTopics.getState().add({ topic: 'T', goal: '', level: 'Complete beginner', how: '', minutes: 10 }, { title: 'T', summary: '', style: '', theme: '', squares: [{ key: 'a1', format: 'lesson', title: 'Cash', focus: 'cash', unit: 'U' }] });
  useTopics.getState().setReadingDepth(id, 'deep');
  const get = () => useTopics.getState().courses.find((c: { id: string }) => c.id === id);
  return { id, get, service: require('../../src/topics/service'), queue: require('../../src/topics/generationQueue') };
};

it('returns and saves the draft first, then replaces it with the deeper reading', async () => {
  const { get, service, queue } = setup();
  const draft = await service.squareContent(get(), 'a1');
  expect(draft.sections[0].text).toBe('Cash is money.');
  expect(get().content.a1.sections[0].text).toBe('Cash is money.'); // saved before any deepening
  while (queue.busy()) await new Promise((r) => setImmediate(r));
  expect(get().content.a1.sections[0].text.length).toBeGreaterThan(400);
});

it('keeps the draft when the deepening hangs and is stopped, and frees the queue', async () => {
  mockHangAfterFirst = true;
  try {
    const { get, service, queue } = setup();
    await service.squareContent(get(), 'a1');
    expect(queue.phaseOf(`${get().id}:a1:deepen`)).toBeDefined();
    service.stopWriting(get().id, 'a1');
    while (queue.busy()) await new Promise((r) => setImmediate(r));
    expect(get().content.a1.sections[0].text).toBe('Cash is money.');
  } finally { mockHangAfterFirst = false; }
});

it('does not overwrite a square the person rewrote while it was deepening', async () => {
  const { get, service, queue, id } = setup();
  await service.squareContent(get(), 'a1');
  const { useTopics } = require('../../src/topics/store');
  const mine = { kind: 'lesson', sections: [{ heading: 'Mine', text: 'My own text.' }], keyPoints: [] };
  useTopics.getState().setContent(id, 'a1', mine);
  while (queue.busy()) await new Promise((r) => setImmediate(r));
  expect(get().content.a1.sections[0].text).toBe('My own text.');
});
