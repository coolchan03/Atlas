import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SquareView, answersMatch } from '../../src/topics/SquareViews';

describe('the other kinds of square', () => {
  it('a calculation: a wrong number says so, the right one (within the tolerance) finishes with the working', () => {
    const done = jest.fn();
    const view = render(<SquareView onDone={done} content={{ kind: 'numeric', task: 'Yearly depreciation?', answer: 4500, tolerance: 1, unit: 'USD', working: ['21000 / 4.667'] }} />);
    fireEvent.changeText(view.getByTestId('numeric-input'), '4000');
    fireEvent.press(view.getByTestId('numeric-check'));
    expect(view.getByTestId('numeric-wrong')).toBeTruthy();
    fireEvent.changeText(view.getByTestId('numeric-input'), '4,500.4');
    fireEvent.press(view.getByTestId('numeric-check'));
    expect(view.getByTestId('numeric-right')).toBeTruthy();
    expect(view.getByTestId('numeric-working')).toBeTruthy();
    fireEvent.press(view.getByTestId('numeric-done'));
    expect(done).toHaveBeenCalledWith(1);
  });
  it('a calculation: text that is not a number is rejected, not marked wrong, and never counts as an answer of 0', () => {
    const done = jest.fn();
    const view = render(<SquareView onDone={done} content={{ kind: 'numeric', task: 'What is the balance after paying it off?', answer: 0, tolerance: 0.5, unit: 'USD', working: ['10 - 10'] }} />);
    for (const junk of ['hello world', 'abc', '5abc10']) {
      fireEvent.changeText(view.getByTestId('numeric-input'), junk);
      fireEvent.press(view.getByTestId('numeric-check'));
      expect(view.getByTestId('numeric-invalid')).toBeTruthy();
      expect(view.queryByTestId('numeric-right')).toBeNull();
      expect(view.queryByTestId('numeric-wrong')).toBeNull();
    }
    fireEvent.changeText(view.getByTestId('numeric-input'), '0');
    fireEvent.press(view.getByTestId('numeric-check'));
    expect(view.getByTestId('numeric-right')).toBeTruthy();
    fireEvent.press(view.getByTestId('numeric-done'));
    expect(done).toHaveBeenCalledWith(3); // junk did not use up tries: still a first-try answer (three stars)
  });
  it('a calculation keeps negative values, decimals and scientific notation', () => {
    const view = render(<SquareView onDone={jest.fn()} content={{ kind: 'numeric', task: 'Net result?', answer: -1250.5, tolerance: 0.01, unit: '', working: [] }} />);
    fireEvent.changeText(view.getByTestId('numeric-input'), '1250.5');
    fireEvent.press(view.getByTestId('numeric-check'));
    expect(view.getByTestId('numeric-wrong')).toBeTruthy(); // the right size but the wrong sign
    fireEvent.changeText(view.getByTestId('numeric-input'), '-1.2505e3');
    fireEvent.press(view.getByTestId('numeric-check'));
    expect(view.getByTestId('numeric-right')).toBeTruthy();
  });
  it('a worked example asks the learner to try each step first, then shows it, says how close they were and ends with the takeaway', () => {
    const done = jest.fn();
    const view = render(<SquareView onDone={done} content={{ kind: 'worked', problem: 'Solve x+2=5', steps: [{ step: 'Subtract 2 from both sides', why: 'undo +2' }, { step: 'x = 3', why: '' }], takeaway: 'Do the same to both sides' }} />);
    // Nothing is shown until the learner has had a go; the button is not a bare Next.
    expect(view.queryByText(/Subtract 2 from both sides/)).toBeNull();
    expect(view.getByTestId('worked-try')).toBeTruthy();
    expect(view.getByTestId('worked-check').props.accessibilityState?.disabled).toBe(true);
    fireEvent.changeText(view.getByTestId('worked-input'), 'subtract 2 from both sides to undo the plus');
    fireEvent.press(view.getByTestId('worked-check'));
    expect(view.getByText(/Subtract 2 from both sides/)).toBeTruthy();
    expect(view.getByText(/You had the main idea/)).toBeTruthy();
    // Not sure: the step is shown with no judgement of the learner.
    fireEvent.press(view.getByTestId('worked-next'));
    expect(view.getByText(/x = 3/)).toBeTruthy();
    expect(view.queryByTestId('worked-feedback-1')).toBeNull();
    expect(view.queryByTestId('worked-try')).toBeNull();
    expect(view.getByTestId('worked-takeaway')).toBeTruthy();
    expect(view.getByTestId('worked-score')).toBeTruthy();
    fireEvent.press(view.getByTestId('worked-done'));
    expect(done).toHaveBeenCalledWith(2);
  });
  it('a table is drawn with the same copy buttons as a chat table', () => {
    const view = render(<SquareView onDone={jest.fn()} content={{ kind: 'table', title: 'Methods', markdown: '| A | B |\n| --- | --- |\n| 1 | 2 |' }} />);
    expect(view.getByTestId('copy-table-copy-table')).toBeTruthy();
  });

  it('typed answers ignore case, accents and punctuation, and allow one slip in a longer answer', () => {
    expect(answersMatch('Debit!', 'debit')).toBe(true);
    expect(answersMatch('cafe', 'Café')).toBe(true);
    expect(answersMatch('Dr', 'debit', ['Dr'])).toBe(true);
    expect(answersMatch('accumulated depreciaton', 'accumulated depreciation')).toBe(true);
    expect(answersMatch('credit', 'debit')).toBe(false);
    expect(answersMatch('', 'debit')).toBe(false);
  });
  it('type the answer: a right and a wrong answer, then the stars', () => {
    const done = jest.fn();
    const view = render(<SquareView onDone={done} content={{ kind: 'typed', mode: 'recall', items: [
      { prompt: 'Left side of a ledger?', answer: 'debit', alternatives: [], why: '' }, { prompt: 'Right side?', answer: 'credit', alternatives: [], why: 'the other one' }] }} />);
    fireEvent.changeText(view.getByTestId('typed-input'), 'Debit');
    fireEvent.press(view.getByTestId('typed-check'));
    expect(view.getByTestId('typed-right')).toBeTruthy();
    fireEvent.press(view.getByTestId('typed-next'));
    fireEvent.changeText(view.getByTestId('typed-input'), 'debit');
    fireEvent.press(view.getByTestId('typed-check'));
    expect(view.getByTestId('typed-wrong')).toBeTruthy();
    fireEvent.press(view.getByTestId('typed-next'));
    expect(done).toHaveBeenCalledWith(1);
  });
  it('fill the table: checking marks the blanks and finishing reports the share right', () => {
    const done = jest.fn();
    const view = render(<SquareView onDone={done} content={{ kind: 'tablefill', title: 'Sale', columns: ['Account', 'Debit', 'Credit'],
      rows: [['Cash', null, ''], ['Sales', '', null]], answers: [['Cash', '500', ''], ['Sales', '', '500']], why: 'cash in' }} />);
    fireEvent.changeText(view.getByTestId('tablefill-0-1'), '500');
    fireEvent.changeText(view.getByTestId('tablefill-1-2'), '400');
    fireEvent.press(view.getByTestId('tablefill-check'));
    expect(view.getByTestId('tablefill-score').props.children.join('')).toContain('1 of 2 right');
    fireEvent.press(view.getByTestId('tablefill-done'));
    expect(done).toHaveBeenCalledWith(1);
  });
  it('sort into groups: a wrong group is counted, the right one places the item', () => {
    const done = jest.fn();
    const view = render(<SquareView onDone={done} content={{ kind: 'sort', groups: ['Acid', 'Base'], items: [{ text: 'lemon', group: 0 }, { text: 'soap', group: 1 }] }} />);
    fireEvent.press(view.getByLabelText('lemon'));
    fireEvent.press(view.getByTestId('sort-group-1'));
    expect(view.getByTestId('sort-mistakes').props.children).toContain('1 in the wrong group');
    fireEvent.press(view.getByLabelText('lemon'));
    fireEvent.press(view.getByTestId('sort-group-0'));
    fireEvent.press(view.getByLabelText('soap'));
    fireEvent.press(view.getByTestId('sort-group-1'));
    expect(done).toHaveBeenCalledWith(2);
  });
  it('a reading square shows the passage above its questions, and a lesson shows common mistakes and a self-test', () => {
    const reading = render(<SquareView onDone={jest.fn()} content={{ kind: 'quiz', passage: 'The cat sat on the mat.', questions: [{ q: 'Who sat?', options: ['The cat', 'The dog'], answer: 0, why: '' }] }} />);
    expect(reading.getByTestId('quiz-passage')).toBeTruthy();
    reading.unmount();
    const lesson = render(<SquareView onDone={jest.fn()} content={{ kind: 'lesson', sections: [{ heading: 'Debit', text: 'Left side.' }], keyPoints: [], commonMistakes: ['Mixing up the sides'], quickCheck: { q: 'Which side is debit?', a: 'Left' } }} />);
    expect(lesson.getByTestId('lesson-mistakes')).toBeTruthy();
    expect(lesson.queryByTestId('quickcheck-answer')).toBeNull();
    fireEvent.press(lesson.getByTestId('quickcheck-show'));
    expect(lesson.getByTestId('quickcheck-answer')).toBeTruthy();
  });
});

describe('a lesson is easier to read', () => {
  const lesson = { kind: 'lesson' as const, sections: [
    { heading: 'Debit', text: 'A **debit** is the left side.', example: 'Cash goes up on the left.' },
    { heading: 'Credit', text: 'A credit is the right side.' },
  ], keyPoints: ['Debit is left'] };

  it('numbers the sections of a lesson with several, and not a lesson with one', () => {
    const view = render(<SquareView onDone={jest.fn()} content={lesson} />);
    expect(view.getByTestId('lesson-step-1')).toBeTruthy();
    expect(view.getByText('2 of 2')).toBeTruthy();
    const plain = render(<SquareView onDone={jest.fn()} content={{ kind: 'lesson', sections: [{ heading: 'One', text: 'Just text.' }], keyPoints: [] }} />);
    expect(plain.queryByTestId('lesson-step-1')).toBeNull();
  });

  it('opens the reading options and shows the choice made', () => {
    const view = render(<SquareView onDone={jest.fn()} content={lesson} />);
    expect(view.queryByTestId('reading-panel')).toBeNull();
    fireEvent.press(view.getByTestId('reading-toggle'));
    fireEvent.press(view.getByTestId('reading-size-large'));
    fireEvent.press(view.getByTestId('reading-font-book'));
    expect(view.getByTestId('reading-size-large').props.accessibilityState.selected).toBe(true);
    expect(view.getByTestId('reading-size-normal').props.accessibilityState.selected).toBe(false);
    expect(view.getByTestId('reading-font-book').props.accessibilityState.selected).toBe(true);
    expect(view.getByTestId('square-lesson')).toBeTruthy();
  });
});
