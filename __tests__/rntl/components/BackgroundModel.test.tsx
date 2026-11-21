/** A model for writing in the background can be chosen in My models, and is the one background work uses. */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { BackgroundModelCard } from '../../../src/components/models/BackgroundModel';
import { useAppStore } from '../../../src/stores/appStore';
import { useSpeedStats } from '../../../src/atlasTools/speed';
import { createDownloadedModel } from '../../utils/factories';

jest.mock('../../../src/atlasTools/models', () => ({ ensureTextModel: jest.fn(async () => undefined) }));

describe('the background model', () => {
  beforeEach(() => {
    useAppStore.setState({ downloadedModels: [createDownloadedModel({ id: 'big', name: 'Big 9B' }), createDownloadedModel({ id: 'small', name: 'Small 3B' })], loadedTextModelId: 'big', activeModelId: 'big' });
    useAppStore.getState().updateSettings({ backgroundModelId: undefined });
    useSpeedStats.setState({ byModel: { big: { decode: 4.4, prefill: 42, outLen: 0, samples: 3 }, small: { decode: 17.2, prefill: 200, outLen: 0, samples: 2 } } as any });
  });

  it('is chosen from the models on the phone, shows each one\'s speed, and names the fastest', () => {
    const view = render(<BackgroundModelCard />);
    expect(view.getByText(/Fastest measured here: Small 3B \(17\.2 tokens a second\)/)).toBeTruthy();
    fireEvent.press(view.getByTestId('background-model-small'));
    expect(useAppStore.getState().settings.backgroundModelId).toBe('small');
    fireEvent.press(view.getByTestId('background-model-none'));
    expect(useAppStore.getState().settings.backgroundModelId).toBeUndefined();
  });

  it('loads the chosen model for background work, speeds the slow-model checks by it, and brings the chat model back', async () => {
    jest.useFakeTimers();
    try {
      const { ensureTextModel } = require('../../../src/atlasTools/models');
      const { backgroundModelId, useBackgroundModelNow, scheduleChatModelRestore } = require('../../../src/study/backgroundModel');
      const { activeWritingSpeed } = require('../../../src/atlasTools/speed');
      expect(backgroundModelId()).toBeNull();
      expect(await useBackgroundModelNow()).toBe(false);
      expect(activeWritingSpeed()).toBeCloseTo(4.4);
      useAppStore.getState().updateSettings({ backgroundModelId: 'small' });
      expect(activeWritingSpeed()).toBeCloseTo(17.2); // the checks follow the model that does the writing
      expect(await useBackgroundModelNow()).toBe(true);
      expect(ensureTextModel).toHaveBeenCalledWith('small');
      expect(useAppStore.getState().activeModelId).toBe('big'); // the chat choice is never changed by loading the background model
      useAppStore.setState({ loadedTextModelId: 'small' });
      scheduleChatModelRestore();
      await jest.advanceTimersByTimeAsync(46_000);
      expect(ensureTextModel).toHaveBeenLastCalledWith('big');
    } finally { jest.useRealTimers(); }
  });
});
