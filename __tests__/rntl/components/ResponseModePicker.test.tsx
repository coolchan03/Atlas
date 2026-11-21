/**
 * Quick, Balanced and Deep: one tap sets existing settings, the picker reads the mode back from them, and a setting changed by hand shows "Custom".
 */
import React from 'react';
import { act, render, fireEvent } from '@testing-library/react-native';
import { ResponseModePicker } from '../../../src/components/GenerationSettingsModal/ResponseModePicker';
import { useAppStore } from '../../../src/stores/appStore';
import { QUICK_MAX_TOKENS, modeOf, settingsFor } from '../../../src/services/responseMode';

const set = (patch: Record<string, unknown>) => useAppStore.setState({ settings: { ...useAppStore.getState().settings, ...patch } });
const settings = () => useAppStore.getState().settings;

describe('the response mode picker', () => {
  beforeEach(() => set({ thinkingEnabled: false, thinkingLevel: undefined, maxTokensMode: 'auto', maxTokens: 1024 }));

  it('starts on Balanced for the default settings', () => {
    const screen = render(<ResponseModePicker />);
    expect(screen.getByText(/How it answers: Balanced/)).toBeTruthy();
  });

  it('Quick turns thinking off and caps the reply; Deep turns thinking on at its highest depth and sizes the reply to memory', () => {
    const screen = render(<ResponseModePicker />);
    fireEvent.press(screen.getByText('Quick'));
    expect(settings()).toMatchObject({ thinkingEnabled: false, maxTokensMode: 'manual', maxTokens: QUICK_MAX_TOKENS });
    expect(screen.getByText(/How it answers: Quick/)).toBeTruthy();
    fireEvent.press(screen.getByText('Deep'));
    expect(settings()).toMatchObject({ thinkingEnabled: true, thinkingLevel: 'high', maxTokensMode: 'auto' });
    expect(screen.getByText(/How it answers: Deep/)).toBeTruthy();
    fireEvent.press(screen.getByText('Balanced'));
    expect(settings()).toMatchObject({ thinkingEnabled: false, maxTokensMode: 'auto' });
    expect(screen.getByText(/How it answers: Balanced/)).toBeTruthy();
  });

  it('says Custom when a setting is changed by hand, and keeps the length a person set when going back to Balanced', async () => {
    set({ maxTokens: 2048 });
    const screen = render(<ResponseModePicker />);
    fireEvent.press(screen.getByText('Quick'));
    await act(async () => { set({ maxTokens: 700 }); }); // dragged the length slider
    expect(screen.getByText(/How it answers: Custom/)).toBeTruthy();
    fireEvent.press(screen.getByText('Balanced'));
    expect(settings().maxTokens).toBe(700);
  });

  it('every mode reads back as itself, and the in-between settings read as custom', () => {
    for (const m of ['quick', 'balanced', 'deep'] as const) expect(modeOf({ thinkingEnabled: false, maxTokens: 1024, ...settingsFor(m) })).toBe(m);
    expect(modeOf({ thinkingEnabled: true, thinkingLevel: 'low', maxTokensMode: 'auto', maxTokens: 1024 })).toBe('custom');
    expect(modeOf({ thinkingEnabled: false, maxTokensMode: 'manual', maxTokens: 1024 })).toBe('custom');
  });
});
