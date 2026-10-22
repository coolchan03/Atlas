/** Malformed native questions cannot shift an answer onto a different rendered choice. */
import { installNativeBoundary, GB, requireRTL } from '../../harness/nativeBoundary';
import { createDownloadedModel } from '../../utils/factories';

jest.unmock('@react-navigation/native');

it('skips a question with empty choices and preserves the valid question and board progress', async () => {
  const boundary = installNativeBoundary({ llama: true, fs: true, ram: { platform: 'android', totalBytes: 12 * GB, availBytes: 8 * GB } });
  const rtl = requireRTL();
  const React = require('react');
  const { StyleSheet } = require('react-native');
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  const { NavigationContainer } = require('@react-navigation/native');
  const { createNativeStackNavigator } = require('@react-navigation/native-stack');
  const { useAppStore } = require('../../../src/stores');
  const { hardwareService } = require('../../../src/services/hardware');
  const { activeModelService } = require('../../../src/services/activeModelService');
  const { useLanguage } = require('../../../src/language/store');
  const { boardFor } = require('../../../src/language/board');
  const { ListeningScreen } = require('../../../src/language/ListeningScreen');
  const { GOOD } = require('../../../src/components/games/kit');

  useAppStore.getState().updateSettings({ inferenceBackend: 'cpu' });
  boundary.fs!.seedFile('/models/small.gguf', 500 * 1024 * 1024);
  await hardwareService.refreshMemoryInfo();
  await useAppStore.setState({
    downloadedModels: [createDownloadedModel({ id: 'llm', engine: 'llama', filePath: '/models/small.gguf', fileSize: 500 * 1024 * 1024 })],
    activeModelId: 'llm',
  });
  await activeModelService.loadTextModel('llm');
  const progress = { 'fr-FR': { greetings: { stars: 2, lessons: 1 } } };
  const memory = { 'fr-FR': { rouge: { box: 2, due: Date.now() + 86400000 } } };
  await useLanguage.setState({
    language: 'fr-FR', level: 1, content: {}, listening: {}, progress, memory, myWords: {}, saved: {}, speaking: false,
  });
  boundary.llama!.scriptCompletion({ text: JSON.stringify({
    title: 'Colour story',
    parts: [
      { lines: [{ t: 'Le vélo est rouge.', en: 'The bicycle is red.' }],
        question: { q: 'What colour is the bicycle?', options: [' ', 'red', 'blue'], answer: 1 } },
      { lines: [{ t: 'La porte est rouge aussi.', en: 'The door is red too.' }],
        question: { q: 'What colour is the door?', options: ['red', 'blue'], answer: 0 } },
    ],
    vocab: [{ t: 'rouge', en: 'red' }],
  }) });
  const square = boardFor(1).find((space: { kind: string }) => space.kind === 'story');
  const Stack = createNativeStackNavigator();
  const screen = rtl.render(React.createElement(NavigationContainer, null,
    React.createElement(Stack.Navigator, { screenOptions: { headerShown: false, animation: 'none' } },
      React.createElement(Stack.Screen, { name: 'Listening', component: ListeningScreen,
        initialParams: { kind: 'story', space: square.key, level: 1 } }),
    ),
  ));

  await screen.findByText('Colour story', {}, { timeout: 8000 });
  expect(boundary.llama!.calls.completion).toHaveLength(1);
  expect(Boolean(screen.queryByTestId('listening-question'))).toBe(false);
  expect(useLanguage.getState().listening['fr-FR'][0].parts[0].question).toBeUndefined();
  rtl.fireEvent.press(screen.getByTestId('listening-next'));
  expect(screen.getByText('What colour is the door?')).toBeTruthy();
  rtl.fireEvent.press(screen.getByRole('button', { name: 'red' }));
  expect(StyleSheet.flatten(screen.getByRole('button', { name: 'red' }).props.style).borderColor).toBe(GOOD);
  rtl.fireEvent.press(screen.getByTestId('listening-next'));
  expect(screen.getByTestId('listening-vocab')).toBeTruthy();
  const expectedProgress = { 'fr-FR': { ...progress['fr-FR'], [square.key]: { stars: 1, lessons: 1 } } };
  expect(useLanguage.getState().progress).toEqual(expectedProgress);
  expect(useLanguage.getState().memory).toEqual(memory);
  const saved = JSON.parse(await AsyncStorage.getItem('atlas-language')).state;
  expect(saved.progress).toEqual(expectedProgress);
  expect(saved.memory).toEqual(memory);
}, 20000);
