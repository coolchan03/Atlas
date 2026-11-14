import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { explore } from '../../harness/monkey';
import { seedApp } from '../../harness/monkeySeed';
import { buildCloze, buildFixItems, buildPairs } from '../../../src/study/games/logic';

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => () => undefined), canGoBack: () => true, getParent: () => ({ navigate: jest.fn() }) };
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => mockNav, useRoute: () => ({ params: {} }), useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, []); }, useIsFocused: () => true }));

const sources = [
  { n: 1, doc: 'Book', part: 1, text: 'Assets equal liabilities plus equity in every balanced company ledger. The lease is a contract to use an asset for a fixed period of time.' },
  { n: 2, doc: 'Book', part: 2, text: 'Liabilities are the amounts that a business owes to other people and organisations. Equity is the owner claim on the assets of the business.' },
];
const terms = [
  { answer: 'Assets', clue: 'What the business owns', src: [1] }, { answer: 'Equity', clue: 'Owner claim on assets', src: [2] },
  { answer: 'Lease', clue: 'Contract to use an asset', src: [1] }, { answer: 'Liabilities', clue: 'What the business owes', src: [2] }, { answer: 'Ledger', clue: 'Record of accounts', src: [1] },
];
const mc = (n: number) => Array.from({ length: n }, (_, i) => ({ q: `Question ${i}?`, options: ['right', 'wrong a', 'wrong b', 'wrong c'], answer: i % 4, why: 'because', src: [1], difficulty: (i % 3) + 1, line: i % 2 }));
const statements = Array.from({ length: 8 }, (_, i) => ({ text: `Statement number ${i} about the ledger`, isTrue: i % 2 === 0, fix: `The correct fact number ${i}`, src: [1] }));
const lines = [{ host: 'A', text: 'Welcome to leases.' }, { host: 'B', text: 'A lease is a contract.' }, { host: 'A', text: 'It lasts a fixed time.' }];

const DATA: Record<string, unknown> = {
  JeopardyGame: { board: [{ name: 'Leases', clues: [{ value: 100, clue: 'A contract to use', answer: 'Lease', src: [1] }, { value: 200, clue: 'What is owed', answer: 'Liabilities', src: [2] }, { value: 300, clue: 'Owner claim', answer: 'Equity', src: [2] }] }, { name: 'Basics', clues: [{ value: 100, clue: 'What is owned', answer: 'Assets', src: [1] }] }] },
  BossGame: { questions: mc(9), boss: 2 },
  ExamGame: { mc: mc(6), tf: statements.slice(0, 4), cloze: buildCloze(terms, sources, { max: 4, seed: 3 }), minutes: 8 },
  ReviewGame: {}, DailyGame: { day: '2026-11-14' },
  PodcastQuizGame: { questions: mc(3), podcastAt: 4, lines, hosts: 2 },
  FeynmanGame: { terms, concepts: terms.map((t) => t.answer) }, TutorGame: { goal: 'the main ideas' }, LevelsGame: { topic: 'Leases', texts: {} }, MnemonicGame: { results: [] },
  PalaceGame: { terms, stations: terms.map((t, i) => ({ room: ['Front door', 'Hallway', 'Kitchen', 'Stairs', 'Garden'][i], term: t.answer, image: `A vivid picture of ${t.answer}`, src: t.src })) },
  ConceptMapGame: { nodes: [{ id: 'a', label: 'Assets' }, { id: 'b', label: 'Equity' }, { id: 'c', label: 'Liabilities' }, { id: 'd', label: 'Lease' }], edges: [{ from: 'a', to: 'b', label: 'funds', src: [1] }, { from: 'c', to: 'a', label: 'funds', src: [2] }, { from: 'd', to: 'a', label: 'uses', src: [1] }] },
  PairsGame: { terms, cards: buildPairs(terms, 5, 2) }, HangmanGame: { terms }, ClozeGame: { terms, items: buildCloze(terms, sources, { max: 6, seed: 5 }) },
  TrueFalseGame: { statements }, TimelineGame: { kind: 'steps', items: [1, 2, 3, 4, 5].map((n) => ({ text: `Step number ${n}`, order: n, label: `Step ${n}`, src: [1] })) },
  SortGame: { buckets: ['Owned', 'Owed'], items: [0, 1, 2, 3, 4, 5].map((i) => ({ text: `Item ${i}`, bucket: i % 2, why: 'because', src: [1] })) },
  ScrambleGame: { terms }, LadderGame: { questions: mc(10), spares: mc(2) }, MistakeGame: { items: buildFixItems(statements.map((s) => ({ ...s, isTrue: false })), 4) },
};
const FILES: Record<string, string> = {
  JeopardyGame: 'BoardGames', BossGame: 'BoardGames', ExamGame: 'BoardGames', ReviewGame: 'BoardGames', DailyGame: 'BoardGames', PodcastQuizGame: 'BoardGames',
  FeynmanGame: 'TutorGames', TutorGame: 'TutorGames', LevelsGame: 'TutorGames', MnemonicGame: 'TutorGames', PalaceGame: 'TutorGames', ConceptMapGame: 'TutorGames',
  PairsGame: 'WordGames', HangmanGame: 'WordGames', ClozeGame: 'WordGames', TrueFalseGame: 'OrderGames', TimelineGame: 'OrderGames', SortGame: 'OrderGames',
  ScrambleGame: 'QuickGames', LadderGame: 'QuickGames', MistakeGame: 'QuickGames',
};

describe('project games survive being played at random', () => {
  it.each(Object.keys(DATA))('%s', async (name) => {
    jest.resetModules();
    installNativeBoundary({ fs: true });
    const rtl = requireRTL();
    const React = require('react');
    const ids = seedApp();
    const type = name.replace(/Game$/, '').toLowerCase();
    const result = { kind: 'game', createdAt: 9, topic: 'Leases', title: name, sources, game: { type, data: DATA[name] } };
    const Game = require(`../../../src/components/games/${FILES[name]}`)[name];
    const view = rtl.render(React.createElement(Game, { result, projectId: ids.project, onOpenSource: jest.fn() }));
    for (const seed of [2, 9, 21]) await explore(view as never, { seed, presses: 40 });
    view.unmount();
  }, 120000);
});
