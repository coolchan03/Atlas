/** Chat backend picker: the forced engines are offered again and a saved choice survives opening it. */
import React from 'react';
import { Platform } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { BackendSelector } from '../../../src/components/settings/textGenAdvancedSections';
import { useAppStore } from '../../../src/stores/appStore';

describe('BackendSelector (Android)', () => {
  const os = Platform.OS;
  beforeAll(() => { (Platform as any).OS = 'android'; });
  afterAll(() => { (Platform as any).OS = os; });

  it('keeps a saved OpenCL choice and lets the user force the NPU', () => {
    useAppStore.setState({ settings: { ...useAppStore.getState().settings, inferenceBackend: 'opencl' as any, backendUserChosen: true } as any });
    const view = render(<BackendSelector />);
    expect(useAppStore.getState().settings.inferenceBackend).toBe('opencl');
    fireEvent.press(view.getByTestId('backend-htp-button'));
    expect(useAppStore.getState().settings.inferenceBackend).toBe('htp');
    expect((useAppStore.getState().settings as any).backendUserChosen).toBe(true);
    expect(view.getByText(/Needs a Q4_0 or Q8_0/)).toBeTruthy();
  });
});
