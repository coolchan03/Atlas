import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SquareView } from '../../src/topics/SquareViews';

const content: any = { kind: 'terms', game: 'crossword', terms: [
  { answer: 'Revenue', clue: 'Money a business earns' }, { answer: 'Expense', clue: 'Money a business spends' }, { answer: 'Liability', clue: 'What is owed' },
  { answer: 'Equity', clue: 'The owner share' }, { answer: 'Ledger', clue: 'Book of accounts' } ] };

it('a crossword square shows the clues, can be skipped, and finishes with stars once every clue is solved', () => {
  const done = jest.fn();
  const view = render(<SquareView onDone={done} content={content} />);
  expect(view.getByTestId('square-terms')).toBeTruthy();
  expect(view.queryByTestId('terms-done')).toBeNull();
  expect(view.getByText(/Select a clue, type the answer, then check it\.$/)).toBeTruthy();
  expect(view.queryByText(/source passage/)).toBeNull();
  // Solve every clue the grid has: select it, type the answer, check it.
  const entries = ['Revenue', 'Expense', 'Liability', 'Equity', 'Ledger'];
  for (const word of entries) {
    const clue = content.terms.find((t: any) => t.answer === word).clue;
    const row = view.queryAllByText(new RegExp(clue));
    if (!row.length) continue; // a word the grid could not place has no clue
    fireEvent.press(row[0]);
    fireEvent.changeText(view.getByPlaceholderText('Type your answer'), word.toUpperCase());
    fireEvent.press(view.getByText('Check answer'));
  }
  fireEvent.press(view.getByTestId('terms-done'));
  expect(done).toHaveBeenCalledWith(3);
});

it('a game that is not finished can be skipped without counting as a failure', () => {
  const done = jest.fn();
  const view = render(<SquareView onDone={done} content={{ ...content, game: 'wordsearch' }} />);
  fireEvent.press(view.getByTestId('terms-skip'));
  expect(done).toHaveBeenCalledWith(2);
});

it('the other games (scramble, memory match, guess the term) open from the same terms', () => {
  for (const game of ['scramble', 'memory', 'hangman']) {
    const view = render(<SquareView onDone={jest.fn()} content={{ ...content, game }} />);
    expect(view.getByTestId('square-terms')).toBeTruthy();
    expect(view.queryByText('This game is not available in this version.')).toBeNull();
    view.unmount();
  }
});
