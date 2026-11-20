/** A model that never stops writing: the lesson still advances, with the sections it finished. Only the AI is faked. */
export {};

const mockCalls: string[] = [];
jest.mock('../../src/study/engine', () => ({
  askModel: jest.fn(async (_system: string, user: string, progress?: (event: 'reading' | 'writing', content: string) => void) => {
    mockCalls.push(user);
    progress?.('reading', '');
    // Section after section, far past any real lesson, and the call never ends on its own.
    let text = '{"sections": [';
    for (let i = 0; i < 60; i++) {
      text += `${i ? ', ' : ''}{"heading": "Part ${i}", "text": "${`Point ${i} says something different about the topic number ${i * 13}. `.repeat(4)}"}`;
      progress?.('writing', text);
    }
    return new Promise<string>(() => undefined);
  }),
  gatherSources: jest.fn(async () => []),
}));

it('cuts a reply that runs on and keeps the finished sections, so the lesson advances', async () => {
  jest.resetModules();
  mockCalls.length = 0;
  require('../../src/atlasTools/offGridState').useOffGrid.setState({ on: true });
  const { useTopics } = require('../../src/topics/store');
  const id = useTopics.getState().add({ topic: 'T', goal: '', level: 'Complete beginner', how: '', minutes: 10 },
    { title: 'T', summary: '', style: '', theme: '', squares: [{ key: 'a1', format: 'lesson', title: 'Alpha', focus: 'alpha', unit: 'Chapter 1' }] });
  useTopics.getState().setReadingDepth(id, 'standard');
  const { squareContent } = require('../../src/topics/service');
  const course = () => useTopics.getState().courses.find((c: { id: string }) => c.id === id);
  const lesson: any = await squareContent(course(), 'a1');
  expect(lesson.kind).toBe('lesson');
  expect(lesson.sections.length).toBeGreaterThanOrEqual(2);
  expect(lesson.sections.length).toBeLessThan(60);
  expect(mockCalls).toHaveLength(1); // one call: it advanced, with no second try
  expect(course().content.a1).toBeTruthy();
}, 20000);
