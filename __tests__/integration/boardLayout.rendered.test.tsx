/** The board sizes its squares from the room it really has, so a padded screen never pushes squares past the board's frame, and every square title reads at one size. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

const spaces = Array.from({ length: 8 }, (_, i) => ({ key: `s${i}`, kind: 'lesson' as const, title: i === 4 ? 'Cash and receivables with a long name that needs three lines' : `Square ${i}`, icon: 'book' }));

it('shrinks the squares to the measured width and keeps their titles at one size, wrapped on words', () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { Board } = require('../../src/language/Board');
  const { SPACING } = require('../../src/constants');
  const view = rtl.render(React.createElement(Board, { spaces, isDone: () => false, isOpen: (i: number) => i < 2, current: 0, onPress: jest.fn() }));
  const widthOf = () => {
    const style = [view.getByTestId('space-s1').props.style].flat(5).filter(Boolean).reduce((a: any, b: any) => ({ ...a, ...b }), {});
    return style.width as number;
  };
  const before = widthOf();
  rtl.act(() => { rtl.fireEvent(view.getByTestId('language-board'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 400 } } }); });
  const after = widthOf();
  const inner = 300 - SPACING.lg * 2 - SPACING.md * 2 - 4;
  expect(after).toBe(Math.floor((inner - 16 * 3) / 4));
  expect(after).toBeLessThan(before);
  // Four squares and their three links fit inside the board's frame.
  expect(after * 4 + 16 * 3).toBeLessThanOrEqual(inner);
  const label = view.getByText(/Cash and receivables/);
  const flat = [label.props.style].flat(5).filter(Boolean).reduce((a: any, b: any) => ({ ...a, ...b }), {});
  expect(flat.fontSize).toBe(10);
  expect(label.props.numberOfLines).toBe(3);
  expect(label.props.adjustsFontSizeToFit).toBeFalsy();
  expect(label.props.allowFontScaling).toBe(false);
});
