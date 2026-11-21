/** The shield on a document: press to treat it as the official standard, press again to take the mark off. */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

it('marks and unmarks a document, and shows a document named as a standard as marked already', () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { OfficialStandardButton } = require('../../../src/components/OfficialStandardButton');
  const { useOfficialDocs } = require('../../../src/standards/officialDocs');
  const book = rtl.render(React.createElement(OfficialStandardButton, { name: 'scan_0042.pdf' }));
  expect(book.getByTestId('official-scan_0042.pdf').props.accessibilityState.checked).toBe(false);
  rtl.fireEvent.press(book.getByTestId('official-scan_0042.pdf'));
  expect(useOfficialDocs.getState().names).toContain('scan_0042.pdf');
  expect(book.getByTestId('official-scan_0042.pdf').props.accessibilityState.checked).toBe(true);
  rtl.fireEvent.press(book.getByTestId('official-scan_0042.pdf'));
  expect(useOfficialDocs.getState().names).not.toContain('scan_0042.pdf');
  expect(book.getByTestId('official-scan_0042.pdf').props.accessibilityState.checked).toBe(false);
  const named = rtl.render(React.createElement(OfficialStandardButton, { name: 'FASB ASC 842 Leases.pdf' }));
  expect(named.getByTestId('official-FASB ASC 842 Leases.pdf').props.accessibilityState.checked).toBe(true);
});
