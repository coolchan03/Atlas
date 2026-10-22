/** Font changes reach rendered messages and inputs, survive hydration, and preserve icon/code faces. */
import '../../../src/theme/patchText';
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Feather';
import { AppearanceScreen } from '../../../src/screens/AppearanceScreen';
import { MarkdownText } from '../../../src/components/MarkdownText';
import { useAppStore } from '../../../src/stores/appStore';
import { startTextAppearance } from '../../../src/theme/globalText';

jest.unmock('react-native-vector-icons/Feather');
jest.mock('react-native/Libraries/Utilities/Platform', () => {
  const platform = jest.requireActual('react-native/Libraries/Utilities/Platform').default;
  // Keep one Platform object for modules loaded by Jest setup and by the screen.
  Object.defineProperty(platform, 'OS', { configurable: true, value: 'android' });
  platform.select = (choices: Record<string, unknown>) => choices.android ?? choices.native ?? choices.default;
  return { __esModule: true, default: platform };
});

const sample = (
  <View>
    <AppearanceScreen />
    <MarkdownText>{'## Message heading\n\nMessage sample'}</MarkdownText>
    <Text testID="cached-terminal-font" style={{ fontFamily: 'AtlasMono' }}>Cached label</Text>
    <Text testID="explicit-code-font" style={{ fontFamily: 'monospace', fontSize: 16 }}>code</Text>
    <Icon testID="icon-font" name="check" size={18} />
  </View>
);

beforeAll(() => startTextAppearance());
beforeEach(() => {
  useAppStore.setState({ themeMode: 'light', settings: { ...useAppStore.getState().settings, appearance: undefined } });
});

it('applies each Android font to messages and inputs across remount, theme change, and saved settings', async () => {
  let view = render(<AppearanceScreen />);
  fireEvent.press(view.getByTestId('font-mono'));
  view.unmount();
  // Open a message after Terminal was selected, as a newly opened chat does.
  view = render(sample);
  expect(view.getByText('Message sample')).toHaveStyle({ fontFamily: 'AtlasMono' });
  fireEvent.press(view.getByTestId('font-serif'));
  expect(view.getByTestId('cached-terminal-font')).toHaveStyle({ fontFamily: 'AtlasBook' });
  expect(view.getByText('Message sample')).toHaveStyle({ fontFamily: 'AtlasBook' });
  expect(view.getByTestId('ai-custom')).toHaveStyle({ fontFamily: 'AtlasBook' });
  fireEvent.press(view.getByTestId('theme-mode-dark'));
  expect(view.getByText('Message sample')).toHaveStyle({ fontFamily: 'AtlasBook' });
  fireEvent.press(view.getByTestId('font-atlas'));
  expect(view.getByTestId('cached-terminal-font')).toHaveStyle({ fontFamily: 'sans-serif' });
  expect(view.getByText('Message sample')).toHaveStyle({ fontFamily: 'sans-serif' });
  expect(view.getByText('Message heading')).toHaveStyle({ fontFamily: 'serif' });
  expect(view.getByTestId('ai-custom')).toHaveStyle({ fontFamily: 'sans-serif' });

  for (const [id, family] of [['sans', 'AtlasClean'], ['condensed', 'AtlasNarrow'],
    ['light', 'AtlasLight'], ['medium', 'AtlasBold'], ['casual', 'AtlasHand'], ['mono', 'AtlasMono']]) {
    fireEvent.press(view.getByTestId(`font-${id}`));
    expect(view.getByText('Message sample')).toHaveStyle({ fontFamily: family });
    expect(view.getByTestId('ai-custom')).toHaveStyle({ fontFamily: family });
  }

  fireEvent.press(view.getByTestId('text-size-xlarge'));
  expect(view.getByTestId('explicit-code-font')).toHaveStyle({ fontFamily: 'monospace', fontSize: 21 });
  expect(view.getByTestId('icon-font')).toHaveStyle({ fontFamily: 'Feather', fontSize: 18 });
  fireEvent.press(view.getByTestId('font-serif'));
  const inputSize = StyleSheet.flatten(view.getByTestId('ai-custom').props.style).fontSize;
  expect(inputSize).toBe(20);
  const storageKey = 'local-llm-app-storage';
  const saved = await AsyncStorage.getItem(storageKey);
  expect(saved).not.toBeNull();
  view.unmount();
  // Reset memory, then hydrate the actual serialized settings saved by the selection.
  await act(async () => {
    await useAppStore.setState({ themeMode: 'light', settings: {
      ...useAppStore.getState().settings, appearance: undefined,
    } });
  });
  await AsyncStorage.setItem(storageKey, saved!);
  await act(async () => { await useAppStore.persist.rehydrate(); });
  view = render(sample);
  expect(view.getByTestId('font-serif').props.accessibilityState).toMatchObject({ selected: true });
  expect(view.getByText('Message sample')).toHaveStyle({ fontFamily: 'AtlasBook' });
  expect(view.getByTestId('ai-custom')).toHaveStyle({ fontFamily: 'AtlasBook', fontSize: inputSize });
  expect(view.getByTestId('icon-font')).toHaveStyle({ fontFamily: 'Feather', fontSize: 18 });
});
