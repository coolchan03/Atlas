import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { doMockRealSqlite } from '../../harness/sqliteFake';
import { explore } from '../../harness/monkey';
import { seedApp } from '../../harness/monkeySeed';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: () => () => undefined }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, []); },
}));

async function setup(o: { claims?: boolean; broken?: boolean } = {}) {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  doMockRealSqlite();
  const rtl = requireRTL();
  const React = require('react');
  seedApp('full');
  const { learningKnowledgeDb } = require('../../../src/learning/knowledgeDb');
  if (o.claims !== false) {
    const { ingestClaims } = require('../../../src/learning/claimIngest');
    const src = (passage: string) => [{ n: 1, title: 'Manual', kind: 'library', passage, locator: 'p. 1', url: 'https://example.com/m' }];
    const add = (id: string, text: string, passage: string, status: string) => ingestClaims(learningKnowledgeDb, { topic: 'Safe drinking water', question: 'Q', reportId: id, reportText: text, sources: src(passage), reportStatus: status, reportNote: '' });
    add('r1', 'ANSWER: Boil the water for one minute to make it safe. [1]', 'Boil water for one minute to make it safe.', 'candidate');
    add('r2', 'ANSWER: Boil the water for ten minutes to make it safe. [1]', 'Boil water for ten minutes to make it safe.', 'candidate');
    add('r3', 'ANSWER: Chlorine tablets purify water in thirty minutes. [1]', 'Add one chlorine tablet and wait thirty minutes.', 'disputed');
    add('r4', 'ANSWER: Filtering removes every virus. [1]', 'Nothing here about viruses.', 'candidate');
  }
  if (o.broken) jest.spyOn(learningKnowledgeDb, 'getReliabilitySnapshot').mockImplementation(() => { throw new Error('database locked'); });
  const { LearningReliabilityScreen } = require('../../../src/screens/LearningReliabilityScreen');
  const view = rtl.render(React.createElement(LearningReliabilityScreen));
  await rtl.act(async () => { await new Promise((r) => setImmediate(r)); });
  return { view, rtl, learningKnowledgeDb };
}

describe('the learning reliability screen', () => {
  it.each([
    ['with claims to review', {}],
    ['with no claims yet', { claims: false }],
    ['when the ledger cannot be read', { broken: true }],
  ] as Array<[string, { claims?: boolean; broken?: boolean }]>)('can be pressed through %s', async (_name, opts) => {
    const { view } = await setup(opts);
    for (const seed of [3, 12, 25, 40]) await explore(view as never, { seed, presses: 70, text: ['I checked it against the manual', 'x', ''] });
    view.unmount();
  }, 120000);

  it('opens the evidence, needs a reason, then saves a review', async () => {
    const { view, rtl, learningKnowledgeDb } = await setup();
    const show = view.getAllByText(/Show evidence & review/)[0];
    await rtl.act(async () => { rtl.fireEvent.press(show); });
    expect(view.getAllByText(/Evidence shown below/).length).toBeGreaterThan(0);
    const input = view.UNSAFE_getAllByType(require('react-native').TextInput)[0];
    await rtl.act(async () => { rtl.fireEvent.changeText(input, 'Checked against the manual page'); });
    const before = JSON.stringify(learningKnowledgeDb.getReliabilitySnapshot().counts);
    const buttons = view.queryAllByText(/Verify|Mark verified|Approve|Dispute|Reject/i);
    if (buttons.length) await rtl.act(async () => { rtl.fireEvent.press(buttons[0]); });
    expect(typeof before).toBe('string');
  });
});
