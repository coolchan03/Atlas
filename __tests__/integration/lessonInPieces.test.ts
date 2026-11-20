/** A slow model writes a lesson in pieces: an outline, the sections two at a time, then the key points. Only the AI is faked. */
export {};

const mockCalls: string[] = [];
jest.mock('../../src/study/engine', () => ({
  askModel: jest.fn(async (_system: string, user: string) => {
    mockCalls.push(user);
    if (user.includes('FIRST write only the outline')) return JSON.stringify({ sections: ['Cash', 'Debts', 'Leases'].map((h) => ({ heading: h, focus: `about ${h}` })) });
    if (user.includes('Now write ONLY what goes with them')) return JSON.stringify({ commonMistakes: ['Mixing up cash and profit'], quickCheck: { q: 'What is cash?', a: 'Money' }, keyPoints: ['Cash is money'] });
    const wanted = ['Cash', 'Debts', 'Leases'].filter((h) => new RegExp(`"${h}" \\(`).test(user));
    return JSON.stringify({ sections: wanted.map((h) => ({ heading: h, text: `${h} explained in plain words, with a clear point.` })) });
  }),
  gatherSources: jest.fn(async () => []),
}));

it('writes a lesson with an outline call, two section calls and a key-points call on a slow model, and saves it', async () => {
  jest.resetModules();
  mockCalls.length = 0;
  require('../../src/atlasTools/offGridState').useOffGrid.setState({ on: true });
  const { useAppStore } = require('../../src/stores/appStore');
  const { useSpeedStats } = require('../../src/atlasTools/speed');
  useAppStore.setState({ activeModelId: 'slow' });
  useSpeedStats.setState({ byModel: { slow: { decode: 4.4, prefill: 42, outLen: 0, samples: 5 } } });
  const { useTopics } = require('../../src/topics/store');
  const id = useTopics.getState().add({ topic: 'T', goal: '', level: 'Complete beginner', how: '', minutes: 10 },
    { title: 'T', summary: '', style: '', theme: '', squares: [{ key: 'a1', format: 'lesson', title: 'Alpha', focus: 'alpha', unit: 'Chapter 1' }] });
  useTopics.getState().setReadingDepth(id, 'standard');
  const { squareContent } = require('../../src/topics/service');
  const course = () => useTopics.getState().courses.find((c: { id: string }) => c.id === id);
  const lesson: any = await squareContent(course(), 'a1');
  expect(lesson.sections.map((s: any) => s.heading)).toEqual(['Cash', 'Debts', 'Leases']);
  expect(lesson.keyPoints).toEqual(['Cash is money']);
  expect(lesson.commonMistakes).toEqual(['Mixing up cash and profit']);
  expect(mockCalls).toHaveLength(4); // outline, two sections, two sections' remainder (one), key points
  expect(course().content.a1.sections).toHaveLength(3);
}, 20000);
