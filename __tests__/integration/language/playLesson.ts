/** Shared by the language tests: plays a lesson the way a learner taps through it. */
import { act, fireEvent, type render } from '@testing-library/react-native';

const current = (screen: ReturnType<typeof render>) =>
  screen.UNSAFE_root.findAllByType(require('../../../src/language/Exercises').ExerciseView)[0]?.props.ex;

/** Answers every exercise correctly (or, with `miss`, gets the first one wrong). */
export async function playLesson(screen: ReturnType<typeof render>, seen = new Set<string>(), miss = false) {
  let missed = !miss;
  for (let guard = 0; guard < 60 && !screen.queryByTestId('lesson-done'); guard++) {
    const prompt = screen.queryByText(/Match the pairs|Pick the Spanish for|What does this mean\?|Listen and pick|Write this in Spanish|Tap what you hear|Fill in the blank|Type this in Spanish|Type what you hear|Unscramble|True or false/);
    if (!prompt) { await act(async () => {}); continue; }
    const items = current(screen);
    seen.add(items.kind);
    if (items.again) seen.add('again');
    if (items.kind === 'match') {
      for (const p of items.pairs) { fireEvent.press(screen.getByLabelText(p.en)); fireEvent.press(screen.getByLabelText(p.t)); }
      continue;
    }
    if (items.kind === 'build' || items.kind === 'hear' || items.kind === 'scramble') {
      for (const w of items.kind === 'scramble' ? [...items.answer] : items.answer.split(/\s+/)) {
        const pool = screen.getAllByText(w);
        fireEvent.press(pool[pool.length - 1]);
      }
    } else if (items.kind === 'type' || items.kind === 'dictation') {
      fireEvent.changeText(screen.getByTestId('lesson-typed'), items.answer);
    } else if (!missed && items.options) {
      missed = true;
      fireEvent.press(screen.getByLabelText(items.options.find((o: string) => o !== items.answer)));
      fireEvent.press(screen.getByTestId('lesson-check'));
      fireEvent.press(screen.getByTestId('lesson-continue'));
      continue;
    } else fireEvent.press(screen.getByLabelText(items.answer));
    fireEvent.press(screen.getByTestId('lesson-check'));
    expect(screen.getByTestId('lesson-feedback').props.children).toBe('Right.');
    fireEvent.press(screen.getByTestId('lesson-continue'));
  }
}

