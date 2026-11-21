import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { explore } from '../../harness/monkey';
import { seedApp } from '../../harness/monkeySeed';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: () => () => undefined }),
  useRoute: () => ({ params: {} }),
}));

const ev = (hash: string, chunk: string, page: number) => ({ sourceId: `src-${hash.slice(0, 4)}`, sourceHash: hash, chunkId: chunk, page, quote: 'a verbatim quote from the page' });

async function setup(seed: boolean) {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  seedApp('full');
  if (seed) {
    const agents = require('../../../src/knowledge/agents');
    const cycles = require('../../../src/knowledge/cycles');
    const law = await agents.routeSubject('law firm pricing and billable hours');
    const acct = await agents.routeSubject('accounting: balance sheet and depreciation');
    const h1 = await cycles.startCycle({ agentId: law.agentId, topicId: law.topicId, topic: 'Law firm pricing', model: 'm' });
    const a = await cycles.addFinding(h1, { question: 'What is realization?', finding: 'Realization is the share of billed time actually collected.', confidence: 0.8, evidence: [ev('1'.repeat(64), 'ch-a1', 3)] });
    await cycles.addFinding(h1, { question: 'What is utilization?', finding: 'Utilization is billable hours over available hours.', confidence: 0.7, evidence: [ev('1'.repeat(64), 'ch-a2', 4)] });
    await cycles.addReview({ recordId: a.recordId, role: 'judge', decision: 'approved', reason: 'ok', by: 'test' });
    await cycles.addReview({ recordId: a.recordId, role: 'manager', decision: 'approved', reason: 'ok', by: 'test' });
    await cycles.finalizeCycle(h1, { status: 'completed', summary: 'law' });
    const h2 = await cycles.startCycle({ agentId: acct.agentId, topicId: acct.topicId, topic: 'Accounting', model: 'm' });
    await cycles.addFinding(h2, { question: 'What is the standard rate?', finding: 'The standard realization rate for firms is 75 percent.', confidence: 0.8, evidence: [ev('2'.repeat(64), 'ch-b1', 9)] });
    await cycles.addFinding(h2, { question: 'What is the standard rate again?', finding: 'The standard realization rate for firms is 90 percent.', confidence: 0.8, evidence: [ev('3'.repeat(64), 'ch-c1', 2)] });
    await cycles.finalizeCycle(h2, { status: 'completed', summary: 'acct' });
    await require('../../../src/knowledge/exchange').createExport({ scope: { kind: 'all' } });
  }
  const { KnowledgeScreen } = require('../../../src/knowledge/KnowledgeScreen');
  const view = rtl.render(React.createElement(KnowledgeScreen));
  await rtl.act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); });
  return { view, rtl };
}

describe('the knowledge screen with experts, findings and an export on the phone', () => {
  it.each([[true], [false]])('can be pressed through (seeded: %s)', async (seeded) => {
    const { view } = await setup(seeded);
    for (const seed of [2, 9, 21, 33, 47]) await explore(view as never, { seed, presses: 70, text: ['realization', 'x', ''] });
    view.unmount();
  }, 120000);
});
