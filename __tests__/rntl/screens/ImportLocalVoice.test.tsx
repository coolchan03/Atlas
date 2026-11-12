/**
 * Models -> Import Local File takes a voice package too: the person picks a sherpa-onnx voice they
 * downloaded, it is installed and chosen, and they are told. The file picker and native engine are
 * the device boundary.
 */
const installed: { id: string; bytes: number }[] = [];
const mockNative = {
  importNeuralVoice: jest.fn(async (_uri: string, name: string) => {
    const id = name.replace(/\.tar\.bz2$/, '');
    installed.push({ id, bytes: 77e6 });
    return id;
  }),
  installedNeuralVoices: jest.fn(async () => installed),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};
require('react-native').NativeModules.AtlasTts = mockNative;

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { pick } from '@react-native-documents/picker';
import { resetStores } from '../../utils/testHelpers';

jest.mock('../../../src/services/huggingFaceModelBrowser', () => ({
  fetchAvailableModels: jest.fn(() => Promise.resolve([])),
  getVariantLabel: jest.fn(() => 'Standard'),
  guessStyle: jest.fn(() => 'creative'),
}));
jest.mock('../../../src/services/coreMLModelBrowser', () => ({ fetchAvailableCoreMLModels: jest.fn(() => Promise.resolve([])) }));

const { ModelsScreen } = require('../../../src/screens/ModelsScreen');

describe('Import Local File with a voice', () => {
  beforeEach(() => { resetStores(); installed.length = 0; jest.clearAllMocks(); });

  it('installs a downloaded Piper voice instead of treating it as a language model', async () => {
    (pick as jest.Mock).mockResolvedValueOnce([{ uri: 'content://downloads/vits-piper-en_GB-alan-medium.tar.bz2', name: 'vits-piper-en_GB-alan-medium.tar.bz2' }]);
    const screen = render(<NavigationContainer><ModelsScreen /></NavigationContainer>);
    await waitFor(() => expect(screen.getByTestId('import-local-model')).toBeTruthy());
    await act(async () => { fireEvent.press(screen.getByTestId('import-local-model')); });
    await waitFor(() => expect(mockNative.importNeuralVoice).toHaveBeenCalledWith(
      'content://downloads/vits-piper-en_GB-alan-medium.tar.bz2', 'vits-piper-en_GB-alan-medium.tar.bz2'));
    expect(installed.map((v) => v.id)).toEqual(['vits-piper-en_GB-alan-medium']);
  });
});
