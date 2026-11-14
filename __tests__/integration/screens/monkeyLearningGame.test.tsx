import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { explore } from '../../harness/monkey';
import { seedApp } from '../../harness/monkeySeed';

const TERMS = ['lease', 'asset', 'liability', 'equity', 'revenue', 'expense', 'ledger', 'journal'].map((w, i) => ({ answer: w, clue: `Clue for ${w}`, src: [1 + (i % 2)] }));

describe('project learning games survive being pressed everywhere', () => {
  it.each(['crossword', 'wordsearch', 'match'])('%s', async (kind) => {
    jest.resetModules();
    installNativeBoundary({ fs: true });
    const rtl = requireRTL();
    const React = require('react');
    seedApp('full');
    const { buildCrossword, buildWordSearch } = require('../../../src/study/learningGames');
    const { ProjectLearningGame } = require('../../../src/components/ProjectLearningGame');
    const activity = {
      kind, title: kind, createdAt: 1, learningTerms: TERMS, sources: [{ n: 1, doc: 'Notes one' }, { n: 2, doc: 'Notes two' }],
      ...(kind === 'crossword' ? { crossword: buildCrossword(TERMS) } : {}), ...(kind === 'wordsearch' ? { wordSearch: buildWordSearch(TERMS) } : {}),
    };
    const view = rtl.render(React.createElement(ProjectLearningGame, { activity, onOpenSource: jest.fn() }));
    for (const seed of [1, 9, 21]) await explore(view as never, { seed, presses: 80 });
    view.unmount();
  }, 60000);
});
