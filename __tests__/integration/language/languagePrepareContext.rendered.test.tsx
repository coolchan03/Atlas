/** Switching course context lets the current item finish, then stops the old preparation batch. */
import { installNativeBoundary, GB, requireRTL } from '../../harness/nativeBoundary';
import { createDownloadedModel } from '../../utils/factories';

jest.unmock('@react-navigation/native');

it.each(['language', 'level'] as const)('stops preparing after a %s change without moving content or progress', async (change) => {
  const boundary = installNativeBoundary({ llama: true, fs: true, ram: { platform: 'android', totalBytes: 12 * GB, availBytes: 8 * GB } });
  const rtl = requireRTL();
  const React = require('react');
  const { NavigationContainer } = require('@react-navigation/native');
  const { createNativeStackNavigator } = require('@react-navigation/native-stack');
  const { useAppStore } = require('../../../src/stores');
  const { hardwareService } = require('../../../src/services/hardware');
  const { activeModelService } = require('../../../src/services/activeModelService');
  const { useLanguage, usePrepareLive } = require('../../../src/language/store');
  const { languageService } = require('../../../src/language/languageService');
  const { unitsForLevel, unitById } = require('../../../src/language/curriculum');
  const { LanguageScreen } = require('../../../src/language/LanguageScreen');

  useAppStore.getState().updateSettings({ inferenceBackend: 'cpu' });
  boundary.fs!.seedFile('/models/small.gguf', 500 * 1024 * 1024);
  await hardwareService.refreshMemoryInfo();
  await useAppStore.setState({
    downloadedModels: [createDownloadedModel({ id: 'llm', engine: 'llama', filePath: '/models/small.gguf', fileSize: 500 * 1024 * 1024 })],
    activeModelId: 'llm',
  });
  await activeModelService.loadTextModel('llm');

  const filler = [{ en: 'already written', t: 'ya escrito' }];
  const content = Object.fromEntries(unitsForLevel(1)
    .filter((unit: { builtIn?: boolean; id: string }) => !unit.builtIn && !['colors', 'family'].includes(unit.id))
    .map((unit: { id: string }) => [unit.id, filler]));
  const progress = { 'es-ES': { greetings: { stars: 2, lessons: 1 } } };
  const memory = { 'es-ES': { hola: { box: 2, due: Date.now() + 86400000 } } };
  await useLanguage.setState({
    language: 'es-ES', level: 1, content: { 'es-ES': content }, listening: {},
    progress, memory, saved: {}, myWords: {}, speaking: false,
  });
  const { pieces } = languageService.levelToPrepare(1);
  await useLanguage.setState({
    listening: { 'es-ES': pieces.map((id: string) => ({ kind: 'story', title: id, parts: [], vocab: [], createdAt: 1, pieceId: id })) },
  });

  const es = ['rojo', 'azul', 'verde', 'amarillo', 'negro', 'blanco', 'El coche es rojo.', 'Mi color favorito es el azul.'];
  const reply = JSON.stringify(unitById('colors').items.map((en: string, i: number) => ({ en, t: es[i] })));
  boundary.llama!.scriptCompletion({ text: reply, holdBeforeStream: true });
  const Stack = createNativeStackNavigator();
  const board = rtl.render(React.createElement(NavigationContainer, null,
    React.createElement(Stack.Navigator, { screenOptions: { headerShown: false, animation: 'none' } },
      React.createElement(Stack.Screen, { name: 'Language', component: LanguageScreen }),
    ),
  ));
  expect(board.getByText(/2 lessons and 0 stories in A1/)).toBeTruthy();
  rtl.fireEvent.press(board.getByTestId('language-prepare-start'));
  await rtl.waitFor(() => expect(boundary.llama!.calls.completion).toHaveLength(1));
  rtl.fireEvent.press(change === 'language' ? board.getByText('Japanese') : board.getByText('A2'));
  expect(useLanguage.getState().language).toBe(change === 'language' ? 'ja-JP' : 'es-ES');
  expect(useLanguage.getState().level).toBe(change === 'level' ? 2 : 1);

  // Native prefill finishes normally; neither the old job nor the new selection owns a cancellation.
  boundary.llama!.scriptCompletion({ text: reply });
  await rtl.act(async () => { boundary.llama!.releaseStream(); });
  await rtl.waitFor(() => expect(usePrepareLive.getState().level).toBeNull(), { timeout: 8000 });
  const state = useLanguage.getState();
  expect(state.content['es-ES'].colors.map((item: { t: string }) => item.t)).toEqual(es);
  expect(state.content['es-ES'].family).toBeUndefined();
  expect(state.content['ja-JP']?.family).toBeUndefined();
  expect(boundary.llama!.calls.completion).toHaveLength(2); // vocabulary + its optional sentence request
  expect(state.progress).toEqual(progress);
  expect(state.memory).toEqual(memory);
  expect(state.language).toBe(change === 'language' ? 'ja-JP' : 'es-ES');
  expect(state.level).toBe(change === 'level' ? 2 : 1);
}, 20000);
