/** The Self-check screen: run the checks, see each result with its reason, and the summary. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));

it('shows what passed, failed and was skipped, with the reasons', async () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { SelfCheckScreen } = require('../../src/screens/SelfCheckScreen');
  const checks = [
    { id: 'a', name: 'Search your documents', run: async () => ({ status: 'pass', detail: '3 documents, 120 passages; a search took 40 ms.' }) },
    { id: 'b', name: 'Looking things up online', run: async () => ({ status: 'fail', detail: 'The search returned nothing: no internet.' }) },
    { id: 'c', name: 'Reading scanned pages', run: async () => ({ status: 'skip', detail: 'No vision model is loaded.' }) },
  ];
  const view = rtl.render(React.createElement(SelfCheckScreen, { checks }));
  rtl.fireEvent.press(view.getByTestId('selfcheck-run'));
  await rtl.waitFor(() => expect(view.getByTestId('selfcheck-summary')).toBeTruthy());
  expect(view.getByText('1 failed, 1 passed, 1 skipped.')).toBeTruthy();
  expect(view.getByText('The search returned nothing: no internet.')).toBeTruthy();
  expect(view.getByText('No vision model is loaded.')).toBeTruthy();
  expect(view.getByTestId('selfcheck-a')).toBeTruthy();
});
