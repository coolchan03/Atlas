/**
 * Writing the next lessons ahead of time. The AI is the device boundary: it answers after a delay the test controls, and records
 * what it was asked and when.
 */
export {};

const mockLog: string[] = [];
const mockGates: Array<() => void> = [];
let mockFail = false;
jest.mock('../../src/study/engine', () => ({
  askModel: jest.fn(async (_system: string, user: string) => {
    const title = `Lesson ${(user.match(/about (\d)/) ?? [])[1] ?? '?'}`; // each square's focus is "about N"
    mockLog.push(`start ${title}`);
    if (mockFail) throw new Error('No model selected');
    await new Promise<void>((resolve) => { mockGates.push(resolve); });
    mockLog.push(`end ${title}`);
    return JSON.stringify({ title: 'L', intro: 'i', sections: [{ heading: 'h', text: 't' }], keyPoints: ['k'] });
  }),
  gatherSources: jest.fn(async () => []),
}));

const flush = () => new Promise((r) => setImmediate(r));
/** Lets the AI finish the next answer it has started, waiting until it has started one. */
async function release(n = 1) {
  for (let i = 0; i < n; i++) {
    for (let wait = 0; wait < 200 && !mockGates.length; wait++) await new Promise((r) => setTimeout(r, 5));
    mockGates.shift()?.();
    await flush();
  }
}

function course(squares = 5) {
  jest.resetModules();
  mockLog.length = 0; mockGates.length = 0; mockFail = false;
  require('../../src/atlasTools/offGridState').useOffGrid.setState({ on: true }); // no web lookup in these tests
  const { useTopics } = require('../../src/topics/store');
  const plan = {
    title: 'T', summary: '', style: '', theme: '',
    squares: Array.from({ length: squares }, (_, i) => ({ key: `s${i + 1}`, format: 'lesson', title: `Lesson ${i + 1}`, focus: `about ${i + 1}`, unit: 'U' })),
  };
  const id = useTopics.getState().add({ topic: 'T', goal: '', level: 'Complete beginner', how: '', minutes: 10 }, plan);
  return { id, useTopics, prepare: require('../../src/topics/prepare'), service: require('../../src/topics/service') };
}

describe('which lessons are written ahead', () => {
  it('takes the first unplayed squares that have no lesson yet, skips ones the app makes in code, and defaults to two', () => {
    const { id, useTopics, prepare } = course(6);
    const get = () => useTopics.getState().courses.find((c: { id: string }) => c.id === id);
    expect(prepare.aheadFor(get())).toBe(2);
    expect(prepare.nextToPrepare(get(), 3)).toEqual(['s1', 's2', 's3']);
    useTopics.getState().complete(id, 's1', 3);
    useTopics.getState().setContent(id, 's2', { kind: 'lesson' });
    expect(prepare.nextToPrepare(get(), 3)).toEqual(['s3', 's4']); // the window is s2, s3, s4: s2 is already written
    useTopics.getState().setPrepareAhead(id, 9);
    expect(prepare.aheadFor(get())).toBe(5);
    useTopics.getState().setPrepareAhead(id, 0);
    expect(prepare.aheadFor(get())).toBe(0);
  });
});

describe('preparing', () => {
  it('writes the next lessons one at a time and keeps them for when the squares are opened', async () => {
    const { id, useTopics, prepare, service } = course(5);
    const run = prepare.prepareAhead(id);
    await release(); await release();
    await run;
    const c = useTopics.getState().courses.find((x: { id: string }) => x.id === id);
    expect(Object.keys(c.content).sort()).toEqual(['s1', 's2']);
    // one at a time: the second only started when the first had ended
    expect(mockLog.map((l) => l.split(' ')[0])).toEqual(['start', 'end', 'start', 'end']);
    expect(await service.squareContent(c, 's1')).toBe(c.content.s1);
    expect(mockLog).toHaveLength(4); // opening a prepared lesson asks the AI for nothing
  });

  it('does nothing when it is off, and stops quietly when the AI cannot write', async () => {
    const off = course(3);
    off.useTopics.getState().setPrepareAhead(off.id, 0);
    await off.prepare.prepareAhead(off.id);
    expect(mockLog).toEqual([]);
    const broken = course(3);
    mockFail = true;
    await broken.prepare.prepareAhead(broken.id);
    expect(broken.prepare.usePrepare.getState().error).toContain('No model selected');
    expect(Object.keys(broken.useTopics.getState().courses[0].content)).toEqual([]);
  });

  it('writes a lesson the person opens before one still waiting, and never writes the same lesson twice', async () => {
    const { id, useTopics, prepare, service } = course(5);
    useTopics.getState().setPrepareAhead(id, 3);
    const get = () => useTopics.getState().courses.find((c: { id: string }) => c.id === id);
    const bg = prepare.prepareAhead(id);
    await flush();
    expect(mockLog).toEqual(['start Lesson 1']); // s1 is being written in the background
    const mine = service.squareContent(get(), 's4'); // the person opens a later square meanwhile
    const sameAsRunning = service.squareContent(get(), 's1'); // and the one already being written
    await release(); // s1 finishes
    await flush();
    expect(mockLog.slice(0, 3)).toEqual(['start Lesson 1', 'end Lesson 1', 'start Lesson 4']); // theirs goes next, before s2 and s3
    await release();
    await mine; await sameAsRunning;
    expect(mockLog.filter((l) => l === 'start Lesson 1')).toHaveLength(1);
    // the background work carries on after a pause (it waits while the person's lesson is written): let it finish
    let done = false;
    void bg.then(() => { done = true; });
    for (let i = 0; i < 40 && !done; i++) { await release(); await new Promise((r) => setTimeout(r, 100)); }
    expect(done).toBe(true);
  }, 20000);
});
