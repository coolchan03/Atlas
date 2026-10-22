import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { installNearbySyncBoundary } from '../../harness/nearbySyncBoundary';

const stored = (state: object) => JSON.stringify({ state, version: 0 });

it('keeps received notes visible and saved when a later sync write fails', async () => {
  const boundary = installNearbySyncBoundary();
  const { nearbySync } = require('../../../src/services/nearbySync');
  const { NearbySyncSettings } = require('../../../src/components/settings/NearbySyncSettings');
  const { SurvivalManualScreen } = require('../../../src/screens/SurvivalManualScreen');
  const { useSurvivalStore } = require('../../../src/survival/store');
  const { ScrollView } = require('react-native');
  let screen: ReturnType<typeof render> | undefined;

  try {
    await AsyncStorage.setItem('atlas-survival-manual', stored({ pos: {}, notes: { Fire: 'Old local note' } }));
    await AsyncStorage.setItem('atlas-checklists', stored({ lists: [] }));
    await useSurvivalStore.persist.rehydrate();
    await nearbySync.init();
    screen = render(<><NearbySyncSettings /><SurvivalManualScreen /></>);

    fireEvent(screen.getByTestId('nearby-sync-toggle'), 'valueChange', true);
    fireEvent.changeText(await screen.findByTestId('nearby-pair-link'), 'atlas://sync?id=peer1234&key=synthetic');
    await waitFor(() => expect(screen!.getByTestId('nearby-join-button')).toBeEnabled());
    fireEvent.press(screen.getByTestId('nearby-join-button'));
    const syncButton = await screen.findByTestId('sync-peer1234');
    await waitFor(() => expect(screen!.getByTestId('sync-peer1234')).toBeEnabled());

    const changedAt = Date.now() + 60_000;
    boundary.setPayload({
      'atlas-survival-manual': {
        value: stored({ pos: {}, notes: { Fire: 'Received firecraft note' } }), changedAt,
      },
      'atlas-checklists': {
        value: stored({ lists: [{ id: 'peer-list', title: 'Peer supplies', items: [] }] }), changedAt,
      },
    });
    boundary.failNextWrite('atlas-checklists');
    fireEvent.press(syncButton);
    await screen.findByText(/Last issue:.*Device storage write interrupted/);

    // The first write committed. Opening its real screen must show that received copy.
    fireEvent.press(screen.getByText('Firecraft'));
    await screen.findByDisplayValue('Received firecraft note');
    fireEvent.scroll(screen.UNSAFE_getAllByType(ScrollView).find((view) => view.props.onScroll)!, {
      nativeEvent: { contentOffset: { y: 80 } },
    });
    await waitFor(async () => {
      const saved = JSON.parse((await AsyncStorage.getItem('atlas-survival-manual'))!);
      expect(saved.state.notes.Fire).toBe('Received firecraft note');
      expect(saved.state.pos.Fire).toBe(80);
    });

    // Retrying the same peer snapshot must keep the committed note in the running app.
    fireEvent.press(screen.getByTestId('sync-peer1234'));
    await waitFor(() => expect(screen!.queryByText(/Last issue:/)).toBeNull());
    expect(screen.getByDisplayValue('Received firecraft note')).toBeTruthy();
  } finally {
    screen?.unmount();
    await nearbySync.setEnabled(false);
    boundary.restore();
  }
});
