/** A board of a whole exam's size: 147 squares draw in rows of four, each square is reachable, and only the ones up to the current one are open. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

it('draws a 147-square board in the snake, with START and FINISH, the pawn on the current square, and the later squares locked', () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { Board } = require('../../src/language/Board');
  const { chapterSquares } = require('../../src/topics/chapterSequence');
  const squares = Array.from({ length: 24 }, (_, i) => chapterSquares(`Topic ${i + 1}`, `Area ${Math.floor(i / 8) + 1}`, 'for the exam')).flat()
    .map((s: any, i: number) => ({ key: `s${i + 1}`, kind: s.checkpoint ? 'checkpoint' : 'lesson', title: s.title, icon: 'book' }));
  expect(squares).toHaveLength(144);
  const done = new Set(squares.slice(0, 7).map((s: any) => s.key));
  const view = rtl.render(React.createElement(Board, { spaces: squares, isDone: (k: string) => done.has(k), isOpen: (i: number) => i <= 7, current: 7, onPress: jest.fn() }));
  expect(view.getByTestId('board-row-0')).toBeTruthy();
  expect(view.getByTestId('board-row-35')).toBeTruthy(); // 144 squares / 4 per row = 36 rows
  expect(view.getByText('START')).toBeTruthy();
  expect(view.getByText('FINISH')).toBeTruthy();
  expect(view.getAllByTestId('board-pawn')).toHaveLength(1);
  expect(view.getByTestId('space-s8').props.accessibilityLabel).not.toContain('locked');
  expect(view.getByTestId('space-s9').props.accessibilityLabel).toContain('locked');
  expect(view.getByTestId('space-s144').props.accessibilityLabel).toContain('locked');
  expect(view.getByTestId('board-take-turn').props.accessibilityLabel).toContain('Play');
});
