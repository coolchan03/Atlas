/** A textbook being sent to the other phone shows its name and progress, and sending can be cancelled. */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

it('shows the transfer and stops sending when cancelled', () => {
  const RN = require('react-native');
  RN.Platform.OS = 'android';
  RN.NativeModules.AtlasNearbySync = { start: jest.fn(), stop: jest.fn(), peers: jest.fn(async () => []), addListener: jest.fn(), removeListeners: jest.fn() };
  const { NearbySyncSettings } = require('../../../src/components/settings/NearbySyncSettings');
  const { nearbySync } = require('../../../src/services/nearbySync');
  const screen = render(<NearbySyncSettings />);
  expect(screen.queryByTestId('sync-transfer')).toBeNull();
  act(() => { (nearbySync as any).publish({ transfer: { label: 'Textbook.pdf', doc: 2, docs: 3, percent: 40 } }); });
  expect(screen.getByText('Sending Textbook.pdf (2 of 3): 40%')).toBeTruthy();
  fireEvent.press(screen.getByTestId('sync-transfer-cancel'));
  expect((nearbySync as any).cancelTransfer).toBe(true);
  act(() => { (nearbySync as any).publish({ transfer: undefined }); });
  expect(screen.queryByTestId('sync-transfer')).toBeNull();
});
