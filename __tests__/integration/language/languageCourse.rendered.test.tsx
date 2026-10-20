/**
 * Learn a language: the board starts with the first unit open and the rest locked. The
 * Health and help unit (built from the phone's phrase cards, no model needed) can be played
 * through; finishing a lesson gives stars, XP and a streak, moves the token on and opens the
 * next unit. The model's translations are checked before they are kept.
 */
import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';

const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
let mockParams: any = {};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNav,
  useRoute: () => ({ params: mockParams }),
}));

import { LanguageScreen } from '../../../src/language/LanguageScreen';
import { LessonScreen } from '../../../src/language/LessonScreen';
import { useLanguage } from '../../../src/language/store';
import { UNITS } from '../../../src/language/curriculum';
import { parseUnitWords } from '../../../src/language/languageService';

beforeEach(() => useLanguage.setState({ language: 'es-ES', content: {}, progress: {}, xp: 0, streak: { day: '', count: 0 } }));

/** Plays a whole lesson answering correctly, the way a learner taps through it. */
async function playLesson(screen: ReturnType<typeof render>, seen = new Set<string>()) {
  for (let guard = 0; guard < 20 && !screen.queryByTestId('lesson-done'); guard++) {
    const prompt = screen.queryByText(/Match the pairs|Pick the Spanish for|What does this mean\?|Listen and pick|Write this in Spanish|Tap what you hear|Fill in the blank/);
    if (!prompt) { await act(async () => {}); continue; }
    const items = (screen.UNSAFE_root.findAllByType(require('../../../src/language/Exercises').ExerciseView)[0].props.ex);
    seen.add(items.kind);
    if (items.kind === 'match') {
      for (const p of items.pairs) { fireEvent.press(screen.getByLabelText(p.en)); fireEvent.press(screen.getByLabelText(p.t)); }
      continue;
    }
    if (items.kind === 'build' || items.kind === 'hear') {
      for (const w of items.answer.split(/\s+/)) {
        const pool = screen.getAllByText(w);
        fireEvent.press(pool[pool.length - 1]);
      }
    } else fireEvent.press(screen.getByLabelText(items.answer));
    fireEvent.press(screen.getByTestId('lesson-check'));
    expect(screen.getByTestId('lesson-feedback').props.children).toBe('Right.');
    fireEvent.press(screen.getByTestId('lesson-continue'));
  }
}

it('plays the Health and help unit and moves along the board', async () => {
  // Health and help is the last unit: open it directly for this test.
  useLanguage.setState({ progress: { 'es-ES': Object.fromEntries(UNITS.slice(0, -1).map((u) => [u.id, { stars: 1, lessons: 1 }])) } });
  const board = render(<LanguageScreen />);
  expect(board.getByLabelText('Health and help')).toBeTruthy();
  fireEvent.press(board.getByTestId('unit-help'));
  expect(mockNav.navigate).toHaveBeenCalledWith('Lesson', { unitId: 'help' });

  mockParams = { unitId: 'help' };
  const lesson = render(<LessonScreen />);
  await waitFor(() => expect(lesson.queryByText(/Getting the words ready/)).toBeNull());
  const seen = new Set<string>();
  await playLesson(lesson, seen);
  // Duolingo-style kinds: translate, meaning, fill in the blank, listen, word order, tap what you hear, match.
  expect([...seen].sort()).toEqual(['blank', 'build', 'choose', 'hear', 'listen', 'match', 'meaning']);
  expect(lesson.getByTestId('lesson-done')).toBeTruthy();
  expect(useLanguage.getState().progress['es-ES'].help.stars).toBe(3);
  expect(useLanguage.getState().xp).toBe(100);
  expect(useLanguage.getState().streak.count).toBe(1);

  const after = render(<LanguageScreen />);
  expect(after.getByLabelText('Health and help, 3 stars')).toBeTruthy();
});

it('opens only the first unit at the start', () => {
  const board = render(<LanguageScreen />);
  expect(board.getByLabelText('Basics')).toBeTruthy();
  expect(board.getByLabelText('Meeting people, locked')).toBeTruthy();
});

it('keeps model translations only when every item is translated', () => {
  const en = ['hello', 'goodbye'];
  expect(parseUnitWords('[{"en":"hello","t":"hola"},{"en":"goodbye","t":"adiós"}]', en, 'es-ES')).toEqual([{ en: 'hello', t: 'hola' }, { en: 'goodbye', t: 'adiós' }]);
  expect(parseUnitWords('[{"en":"hello","t":"hola"}]', en, 'es-ES')).toBeNull();
  expect(parseUnitWords('[{"t":"hello"},{"t":"goodbye"}]', en, 'es-ES')).toBeNull();
});
