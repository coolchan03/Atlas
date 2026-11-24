/** The line under each document: what it is for (tap to switch) and the note on an older edition. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

it('shows what a document is for, switches it on a tap, and says when an older edition is not used', () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { DocRoleLine } = require('../../src/components/DocRoleLine');
  const { roleOf } = require('../../src/standards/docRoles');
  const names = ['Federal Taxation textbook.pdf', 'Title 26 - Internal Revenue Code.pdf', 'IRS Pub 17 (2023).pdf', 'IRS Pub 17 (2024).pdf'];
  const view = rtl.render(React.createElement(React.Fragment, null, names.map((n) => React.createElement(DocRoleLine, { key: n, name: n, names }))));
  expect(view.getAllByText('Teaches lessons')).toHaveLength(3);
  expect(view.getAllByText('Reference: checks lessons')).toHaveLength(1);
  expect(view.getByTestId('older-IRS Pub 17 (2023).pdf')).toBeTruthy();
  expect(view.queryByTestId('older-IRS Pub 17 (2024).pdf')).toBeNull();
  rtl.fireEvent.press(view.getByTestId('role-Federal Taxation textbook.pdf'));
  expect(roleOf('Federal Taxation textbook.pdf')).toBe('reference');
  rtl.fireEvent.press(view.getByTestId('role-Federal Taxation textbook.pdf'));
  expect(roleOf('Federal Taxation textbook.pdf')).toBe('teach');

  // The type of a source: what Atlas guessed, and a tap to correct it (a guess made by the person is marked, and the last tap goes back to the guess).
  expect(view.getByText('Type: Internal Revenue Code')).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('kind-Federal Taxation textbook.pdf'));
  expect(view.getByText('Type: Internal Revenue Code (set by you)')).toBeTruthy();
  for (let i = 0; i < 7; i += 1) rtl.fireEvent.press(view.getByTestId('kind-Federal Taxation textbook.pdf'));
  expect(view.getByText('Type: Not a source of this kind (set by you)')).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('kind-Federal Taxation textbook.pdf'));
  expect(view.queryByText(/set by you/)).toBeNull();

  // In a markets project the types are that field's: what Atlas guessed, and a tap to change it.
  const { useProjectStore } = require('../../src/stores/projectStore');
  const project = useProjectStore.getState().createProject({ name: 'Markets', description: '', systemPrompt: '', icon: '#10B981' });
  useProjectStore.getState().updateProject(project.id, { profileId: 'equities' });
  const markets = rtl.render(React.createElement(DocRoleLine, { name: 'AAPL 10-K 2023.pdf', names: ['AAPL 10-K 2023.pdf'], projectId: project.id }));
  expect(markets.getByText('Type: SEC filing')).toBeTruthy();
  rtl.fireEvent.press(markets.getByTestId('kind-AAPL 10-K 2023.pdf'));
  expect(markets.getByText('Type: SEC filing (set by you)')).toBeTruthy();
  rtl.fireEvent.press(markets.getByTestId('kind-AAPL 10-K 2023.pdf'));
  expect(markets.getByText('Type: Exchange or regulator rule (set by you)')).toBeTruthy();
});
