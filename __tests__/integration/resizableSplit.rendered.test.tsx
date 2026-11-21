import { requireRTL } from '../harness/nativeBoundary';

let mockSize = { width: 1280, height: 800 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: () => ({ ...mockSize, scale: 2, fontScale: 1 }) }));

it('puts the panes side by side on a wide window, stacks them on a tall one, and a screen reader can resize them', () => {
  const rtl = requireRTL();
  const React = require('react');
  const { Text } = require('react-native');
  const { ResizableSplit } = require('../../src/components/ResizableSplit');
  const { usePaneRatios } = require('../../src/hooks/paneRatio');
  usePaneRatios.setState({ ratios: {} });
  const view = rtl.render(React.createElement(ResizableSplit, { testID: 'split', first: React.createElement(Text, null, 'Board'), second: React.createElement(Text, null, 'Square') }));
  const flat = (n: any) => Object.assign({}, ...[n.props.style].flat(Infinity).filter(Boolean));
  expect(flat(view.getByTestId('split')).flexDirection).toBe('row');
  expect(view.getByText('Board')).toBeTruthy(); expect(view.getByText('Square')).toBeTruthy();
  const divider = view.getByTestId('pane-divider');
  expect(divider.props.accessibilityRole).toBe('adjustable');
  rtl.act(() => { divider.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }); });
  expect(Object.values(usePaneRatios.getState().ratios)[0]).toBeCloseTo(0.55);
  view.unmount();
  mockSize = { width: 820, height: 1280 };
  const tall = rtl.render(React.createElement(ResizableSplit, { testID: 'split', first: React.createElement(Text, null, 'Board'), second: React.createElement(Text, null, 'Square') }));
  expect(flat(tall.getByTestId('split')).flexDirection).toBe('column');
});
