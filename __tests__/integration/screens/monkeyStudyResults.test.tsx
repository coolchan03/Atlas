import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { explore } from '../../harness/monkey';
import { seedApp } from '../../harness/monkeySeed';

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => () => undefined), canGoBack: () => true, getParent: () => ({ navigate: jest.fn() }) };
let mockParams: Record<string, unknown> = {};
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => mockNav, useRoute: () => ({ params: mockParams }), useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, []); }, useIsFocused: () => true }));

const TERMS = ['lease', 'asset', 'liability', 'equity', 'revenue', 'expense', 'ledger', 'journal'].map((w, i) => ({ answer: w, clue: `Clue for ${w}`, src: [1 + (i % 2)] }));

describe('every kind of saved study result opens and can be pressed through', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 20, 21, 22, 23])('result %s', async (openAt) => {
    jest.resetModules();
    installNativeBoundary({ fs: true });
    const rtl = requireRTL();
    const React = require('react');
    const ids = seedApp('full');
    const { useStudyStore } = require('../../../src/study/engine');
    const { buildCrossword, buildWordSearch } = require('../../../src/study/learningGames');
    const src = [{ n: 1, doc: 'Notes', part: 1, text: 'A lease is a contract.' }, { n: 2, doc: 'Book', part: 2, text: 'Assets are what you own.', url: 'https://example.com/a' }];
    const extra = [
      { kind: 'crossword', createdAt: 20, topic: 'Leases', title: 'Crossword', sources: src, learningTerms: TERMS, crossword: buildCrossword(TERMS) },
      { kind: 'wordsearch', createdAt: 21, topic: 'Leases', title: 'Word search', sources: src, learningTerms: TERMS, wordSearch: buildWordSearch(TERMS) },
      { kind: 'match', createdAt: 22, topic: 'Leases', title: 'Match', sources: src, learningTerms: TERMS },
      { kind: 'podcast', createdAt: 23, topic: 'News', title: 'Briefing', sources: src, hosts: 2, minutes: 2, headlines: [{ title: 'Story', source: 'BBC', interest: 'news', url: 'https://example.com/s' }], storyStarts: [0],
        podcast: [{ host: 'A', text: 'Good morning.' }, { host: 'B', text: 'First story.' }, { host: 'A', text: 'Second.' }] },
    ];
    for (const r of extra) useStudyStore.getState().add(ids.project, r);
    mockParams = { projectId: ids.project, openAt };
    const { StudyScreen } = require('../../../src/screens/StudyScreen');
    const view = rtl.render(React.createElement(StudyScreen));
    for (const seed of [3, 17]) await explore(view as never, { seed, presses: 70 });
    view.unmount();
  }, 120000);
});
