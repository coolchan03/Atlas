/** A feature that needs the internet says so when off-grid mode is on, and says nothing otherwise. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

it('shows only while off-grid mode is on', () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { OfflineNote } = require('../../src/components/OfflineNote');
  const { useOffGrid } = require('../../src/atlasTools/offGridState');
  useOffGrid.setState({ on: false });
  const view = rtl.render(React.createElement(OfflineNote, { what: 'downloading maps' }));
  expect(view.queryByTestId('offline-note')).toBeNull();
  rtl.act(() => { useOffGrid.setState({ on: true }); });
  expect(view.getByText(/Off-grid mode is on, so downloading maps needs the internet/)).toBeTruthy();
});
