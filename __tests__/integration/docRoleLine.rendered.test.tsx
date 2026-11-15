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
});
