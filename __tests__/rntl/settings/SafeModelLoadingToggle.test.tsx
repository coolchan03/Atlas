import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeModelLoadingToggle } from '../../../src/components/settings/textGenAdvancedSections';
import { useAppStore } from '../../../src/stores/appStore';
import { __resetLoadGuardForTests, enterStage } from '../../../src/services/loadGuard';

const store: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (k: string) => store[k] ?? null);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (k: string, v: string) => { store[k] = v; });
  __resetLoadGuardForTests();
  useAppStore.setState({ settings: { ...useAppStore.getState().settings, safeModelLoading: false } });
});

describe('SafeModelLoadingToggle', () => {
  it('switches Safe Model Loading on and off', () => {
    const { getByTestId } = render(<SafeModelLoadingToggle />);
    fireEvent.press(getByTestId('safe-model-loading-on-button'));
    expect(useAppStore.getState().settings.safeModelLoading).toBe(true);
    fireEvent.press(getByTestId('safe-model-loading-off-button'));
    expect(useAppStore.getState().settings.safeModelLoading).toBe(false);
  });

  it('says in plain words when nothing has crashed and offers no reset', async () => {
    const { getByTestId, queryByTestId } = render(<SafeModelLoadingToggle />);
    await waitFor(() => expect(getByTestId('load-health-summary').props.children).toMatch(/No model load has crashed/));
    expect(queryByTestId('forget-crash-history-button')).toBeNull();
  });

  it('explains a crash from the previous run and lets the user forget it', async () => {
    await enterStage({ modelPath: '/m/gemma-4.gguf', backend: 'opencl', mtp: false, vision: true, stage: 'vision' });
    __resetLoadGuardForTests(); // the app was killed during the picture-file step
    const { getByTestId, queryByTestId } = render(<SafeModelLoadingToggle />);
    await waitFor(() => expect(getByTestId('load-health-summary').props.children).toMatch(/starting the picture \(vision\) file for gemma-4\.gguf/));
    fireEvent.press(getByTestId('forget-crash-history-button'));
    await waitFor(() => expect(queryByTestId('forget-crash-history-button')).toBeNull());
    expect(getByTestId('load-health-summary').props.children).toMatch(/No model load has crashed/);
  });
});
