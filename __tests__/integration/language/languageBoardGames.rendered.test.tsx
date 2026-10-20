/**
 * The board's extras, the way the learner meets them: a lesson left halfway carries on where
 * it stopped, the word search hides the target-language words for an English word bank,
 * tapping a word shows its meaning, and word-order tiles include words that do not belong.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
let mockParams: any = {};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNav,
  useRoute: () => ({ params: mockParams }),
}));

import { LessonScreen } from '../../../src/language/LessonScreen';
import { WordSearchScreen } from '../../../src/language/WordSearchScreen';
import { Tappable } from '../../../src/language/Tappable';
import { useLanguage } from '../../../src/language/store';
import { languageService } from '../../../src/language/languageService';
import { buildLesson, words } from '../../../src/language/lessons';

const colours = [
  { en: 'red', t: 'rojo' }, { en: 'blue', t: 'azul' }, { en: 'green', t: 'verde' }, { en: 'white', t: 'blanco' },
  { en: 'black', t: 'negro' }, { en: 'yellow', t: 'amarillo' }, { en: 'The car is red.', t: 'El coche es rojo.' },
  { en: 'I like the blue house.', t: 'Me gusta la casa azul.' },
];

beforeEach(() => {
  mockNav.goBack.mockClear();
  useLanguage.setState({
    language: 'es-ES', content: { 'es-ES': { basics: colours } }, progress: {}, xp: 0,
    streak: { day: '', count: 0 }, saved: {}, glossary: {}, memory: {},
  });
});

it('carries on a lesson where the learner left it', async () => {
  mockParams = { unitId: 'basics', key: 'basics' };
  const first = render(<LessonScreen />);
  await waitFor(() => expect(first.queryByText(/Getting the words ready/)).toBeNull());
  const ex = first.UNSAFE_root.findAllByType(require('../../../src/language/Exercises').ExerciseView)[0].props.ex;
  fireEvent.press(first.getByLabelText(ex.answer));
  fireEvent.press(first.getByTestId('lesson-check'));
  fireEvent.press(first.getByTestId('lesson-continue'));
  first.unmount();

  expect(languageService.savedLesson('basics')?.index).toBe(1);
  const again = render(<LessonScreen />);
  await waitFor(() => expect(again.queryByText(/Getting the words ready/)).toBeNull());
  const shown = again.UNSAFE_root.findAllByType(require('../../../src/language/Exercises').ExerciseView)[0].props.ex;
  expect(shown).toEqual(languageService.savedLesson('basics')!.exercises[1]);
});

it('hides the Spanish words for an English word bank, and finishing marks the square done', async () => {
  mockParams = { unitId: 'basics', key: 'wordsearch@1.11' };
  const screen = render(<WordSearchScreen />);
  await screen.findByTestId('wordsearch-grid');
  expect(screen.getByText('red')).toBeTruthy();
  // Find every hidden word by tapping its first and last letter.
  const cells = screen.getAllByLabelText(/^\S+ \d+-\d+$/).map((c) => c.props.accessibilityLabel as string);
  const size = Math.sqrt(cells.length);
  const letters = cells.map((l) => l.split(' ')[0]);
  const bank = ['ROJO', 'AZUL', 'VERDE', 'BLANCO', 'NEGRO', 'AMARILLO'];
  for (const w of bank) {
    const at = findWord(letters, size, w);
    expect(at).not.toBeNull();
    const [start, end] = at!;
    fireEvent.press(screen.getByLabelText(`${letters[start]} ${Math.floor(start / size) + 1}-${(start % size) + 1}`));
    fireEvent.press(screen.getByLabelText(`${letters[end]} ${Math.floor(end / size) + 1}-${(end % size) + 1}`));
  }
  expect(await screen.findByTestId('wordsearch-done')).toBeTruthy();
  expect(languageService.isDone('wordsearch@1.11')).toBe(true);
}, 20000);

it('shows a word\'s meaning when it is tapped', async () => {
  useLanguage.setState({ glossary: { 'es-ES': { coche: 'car' } } });
  const screen = render(<Tappable text="El coche es rojo." />);
  fireEvent.press(screen.getByLabelText('Meaning of coche'));
  expect(await screen.findByText(/= car/)).toBeTruthy();
});

it('adds words that do not belong to the word-order tiles', () => {
  const lesson = buildLesson(colours, 7, { length: 14, production: 0.5 });
  const build = lesson.find((e) => e.kind === 'build' || e.kind === 'hear') as { tiles: string[]; answer: string };
  expect(build).toBeTruthy();
  expect(build.tiles.length).toBeGreaterThanOrEqual(words(build.answer).length + 2);
});

/** First and last cell of a word placed in any of the eight directions. */
function findWord(letters: string[], size: number, word: string): [number, number] | null {
  const w = [...word];
  for (let i = 0; i < letters.length; i++) {
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1], [0, -1], [-1, 0], [-1, -1], [-1, 1]]) {
      const r0 = Math.floor(i / size), c0 = i % size;
      const ok = w.every((ch, k) => {
        const r = r0 + dr * k, c = c0 + dc * k;
        return r >= 0 && c >= 0 && r < size && c < size && letters[r * size + c] === ch;
      });
      if (ok) return [i, (r0 + dr * (w.length - 1)) * size + c0 + dc * (w.length - 1)];
    }
  }
  return null;
}

it('turns the right and wrong sounds off from the board', () => {
  const { LanguageScreen } = require('../../../src/language/LanguageScreen');
  useLanguage.setState({ sounds: true });
  const board = render(<LanguageScreen />);
  fireEvent.press(board.getByLabelText('Sounds on'));
  expect(board.getByLabelText('Sounds off')).toBeTruthy();
  expect(useLanguage.getState().sounds).toBe(false);
});

it('brings a missed exercise back at the end, and scores only the first try', async () => {
  const { playLesson } = require('./playLesson');
  mockParams = { unitId: 'basics', key: 'basics' };
  const lesson = render(<LessonScreen />);
  await waitFor(() => expect(lesson.queryByText(/Getting the words ready/)).toBeNull());
  const seen = new Set<string>();
  await playLesson(lesson, seen, true);
  expect(seen.has('again')).toBe(true);
  const summary = lesson.getByText(/ of \d+ right/).props.children.join('');
  const [, right, total] = summary.match(/^(\d+) of (\d+) right/)!;
  expect(Number(right)).toBe(Number(total) - 1);
});

it('ends each level with a checkpoint that marks the square done when passed', async () => {
  const { playLesson } = require('./playLesson');
  const { boardFor } = require('../../../src/language/board');
  const last = boardFor(1)[boardFor(1).length - 1];
  expect(last).toMatchObject({ kind: 'checkpoint', title: 'A1 checkpoint' });
  mockParams = { unitId: 'help', mode: 'checkpoint', key: last.key, level: 1 };
  const lesson = render(<LessonScreen />);
  await waitFor(() => expect(lesson.queryByText(/Getting the words ready/)).toBeNull());
  await playLesson(lesson);
  expect(lesson.getByText(/^Passed: \d+ of \d+ right/)).toBeTruthy();
  expect(languageService.isDone(last.key)).toBe(true);
}, 20000);

it('reviews studied words on a review square', async () => {
  const { playLesson } = require('./playLesson');
  useLanguage.setState({ progress: { 'es-ES': { basics: { stars: 1, lessons: 1 } } } });
  mockParams = { unitId: 'basics', mode: 'review', key: 'review@1.9' };
  const lesson = render(<LessonScreen />);
  await waitFor(() => expect(lesson.queryByText(/Getting the words ready/)).toBeNull());
  await playLesson(lesson);
  expect(lesson.getByTestId('lesson-done')).toBeTruthy();
  expect(languageService.isDone('review@1.9')).toBe(true);
}, 20000);

it('asks the learner to say phrases out loud when the phone has a speech recognizer', async () => {
  const { playLesson } = require('./playLesson');
  const RN = require('react-native');
  const os = RN.Platform.OS;
  RN.Platform.OS = 'android';
  RN.PermissionsAndroid.request = jest.fn(async () => 'granted');
  try {
    useLanguage.setState({ speaking: true });
    mockParams = { unitId: 'basics', key: 'basics' };
    const lesson = render(<LessonScreen />);
    await waitFor(() => expect(lesson.queryByText(/Getting the words ready/)).toBeNull());
    const seen = new Set<string>();
    await playLesson(lesson, seen);
    expect(seen.has('speak')).toBe(true);
    expect(lesson.getByTestId('lesson-done')).toBeTruthy();
  } finally { RN.Platform.OS = os; }
}, 20000);

it('tracks a daily XP goal on the board, and the goal can be changed', () => {
  const { LanguageScreen } = require('../../../src/language/LanguageScreen');
  useLanguage.setState({ goal: 100, today: { day: '', xp: 0 } });
  languageService.finishLesson('basics', { right: 6, total: 8 });
  const board = render(<LanguageScreen />);
  expect(board.getByText('60 / 100 XP today')).toBeTruthy();
  fireEvent.press(board.getByTestId('language-goal'));
  expect(board.getByText('60 / 200 XP today')).toBeTruthy();
  languageService.finishLesson('intro', { right: 8, total: 8 });
  languageService.finishLesson('numbers', { right: 8, total: 8 });
  expect(render(<LanguageScreen />).getByText('Goal met')).toBeTruthy();
});
