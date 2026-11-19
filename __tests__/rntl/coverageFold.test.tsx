import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { CoverageFold } from '../../src/topics/BoardExtras';

const course: any = {
  id: 'c1', bookChapters: [{ doc: 'A.pdf', number: 1, title: 'Leases' }, { doc: 'B.pdf', number: 4, title: 'Leases' }],
  squares: [{ key: 'l1', unit: 'Leases', format: 'lesson', title: 'x', focus: 'x' }], content: { l1: {} }, progress: {},
};

it('shows every book, how far each unit is taught, and what cannot be claimed', () => {
  const { getByTestId, getByText, queryByText } = render(<CoverageFold course={course} />);
  expect(queryByText(/A.pdf: 1 chapters kept/)).toBeNull(); // closed until opened
  fireEvent.press(getByTestId('course-coverage-toggle'));
  expect(getByText('A.pdf: 1 chapters kept')).toBeTruthy();
  expect(getByText('B.pdf: 1 chapters kept')).toBeTruthy();
  expect(getByText(/Leases: written, not yet passed \(1 of 1 written\)/)).toBeTruthy();
  expect(getByText(/does not prove the lessons teach every concept/)).toBeTruthy();
});

it('shows nothing for a course that was not planned from books', () => {
  const { queryByTestId } = render(<CoverageFold course={{ ...course, bookChapters: undefined }} />);
  expect(queryByTestId('course-coverage')).toBeNull();
});
