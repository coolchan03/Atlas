import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockGrade = jest.fn(async () => ({ score: 90, feedback: 'Right accounts.' }));
jest.mock('../../src/topics/service', () => ({ gradeAnswer: (...a: unknown[]) => (mockGrade as any)(...a) }));

import { SquareView } from '../../src/topics/SquareViews';

const content: any = {
  kind: 'practice', task: 'Prepare a journal entry to record the cash purchase of television translator equipment.', hint: '', rubric: ['debits equipment'],
  model: 'Dr. Equipment (Capital Asset) Cr. Cash',
};

it('an assignment that asks for a journal entry is a table of account, debit and credit, with accounts to pick from', async () => {
  const done = jest.fn();
  const view = render(<SquareView onDone={done} content={content} />);
  expect(view.getByTestId('journal-editor')).toBeTruthy();
  expect(view.queryByTestId('practice-input')).toBeNull();
  expect(view.getByTestId('practice-check').props.accessibilityState?.disabled).toBe(true);

  // Pick the account from the list for line 1, type the other, and enter the amounts.
  fireEvent.press(view.getByTestId('journal-pick-Equipment'));
  fireEvent.changeText(view.getByTestId('journal-debit-0'), '12,000');
  fireEvent(view.getByTestId('journal-account-1'), 'focus');
  fireEvent.changeText(view.getByTestId('journal-account-1'), 'Ca');
  fireEvent.press(view.getByTestId('journal-pick-Cash'));
  fireEvent.changeText(view.getByTestId('journal-credit-1'), '12000');
  expect(view.getByTestId('journal-balance')).toBeTruthy();

  fireEvent.press(view.getByTestId('journal-add-line'));
  expect(view.getByTestId('journal-account-2')).toBeTruthy();

  fireEvent.press(view.getByTestId('practice-check'));
  await waitFor(() => expect(view.getByTestId('practice-feedback')).toBeTruthy());
  // What is marked is the entry as lines, not an empty box.
  expect((mockGrade.mock.calls[0] as any)[0].answer).toBe('Dr. Equipment 12,000\n    Cr. Cash 12000');
});

it('any other assignment is still a plain answer box', () => {
  const view = render(<SquareView onDone={jest.fn()} content={{ ...content, task: 'Explain in two sentences why revenue is recognised when it is available.', model: 'Because it is measurable and available.' }} />);
  expect(view.getByTestId('practice-input')).toBeTruthy();
  expect(view.queryByTestId('journal-editor')).toBeNull();
});
