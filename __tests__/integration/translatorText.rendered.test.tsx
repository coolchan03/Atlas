import { requireRTL } from '../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }), useRoute: () => ({ params: {} }) }));

it('translates typed text into the chosen language, keeps it in the recent list, and lets the language be changed and swapped', async () => {
  const rtl = requireRTL();
  const React = require('react');
  const { useAppStore } = require('../../src/stores/appStore');
  const { llmService } = require('../../src/services/llm');
  const { TranslatorScreen } = require('../../src/translator/TranslatorScreen');
  const { useTranslator } = require('../../src/translator/store');

  useAppStore.setState({ downloadedModels: [{ id: 'm1', name: 'Qwen', fileName: 'q.gguf', filePath: '/m/q.gguf', fileSize: 1, engine: 'llama' }], activeModelId: 'm1', loadedTextModelId: 'm1' });
  jest.spyOn(llmService, 'isModelLoaded').mockReturnValue(true);
  const asked: any[][] = [];
  jest.spyOn(llmService, 'generateResponse').mockImplementation(async (messages: any) => { asked.push(messages); return '<think>ok</think>Translation: "¿Dónde está la estación?"'; });
  useTranslator.setState({ mode: 'text', from: 'en-US', to: 'es-ES', history: [] });

  const view = rtl.render(React.createElement(TranslatorScreen));
  rtl.fireEvent.changeText(view.getByTestId('translator-input'), 'Where is the station?');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('translator-go')); });
  await rtl.waitFor(() => expect(view.getByTestId('translator-result')).toBeTruthy());
  expect(rtl.within(view.getByTestId('translator-result')).getByText('¿Dónde está la estación?')).toBeTruthy(); // the label and the quotation marks are gone
  expect(asked[0][0].content).toMatch(/from English into Spanish/);
  expect(asked[0][1].content).toBe('Where is the station?');
  expect(useTranslator.getState().history[0]).toMatchObject({ original: 'Where is the station?', translation: '¿Dónde está la estación?' });

  // Pick another language to translate into, from the searchable list.
  rtl.fireEvent.press(view.getByTestId('translator-to'));
  rtl.fireEvent.changeText(view.getByTestId('language-search'), 'french');
  rtl.fireEvent.press(view.getByTestId('language-fr-FR'));
  expect(useTranslator.getState().to).toBe('fr-FR');

  // Swap puts French first; "Detect language" can be chosen for the source and then there is nothing to swap.
  rtl.fireEvent.press(view.getByTestId('translator-swap'));
  expect(useTranslator.getState()).toMatchObject({ from: 'fr-FR', to: 'en-US' });
  rtl.fireEvent.press(view.getByTestId('translator-from'));
  rtl.fireEvent.press(view.getByTestId('language-detect'));
  expect(useTranslator.getState().from).toBeNull();
  rtl.fireEvent.press(view.getByTestId('translator-swap'));
  expect(useTranslator.getState().to).toBe('en-US');

  // "Translate this back" moves the translation into the box and swaps the languages.
  useTranslator.setState({ from: 'en-US', to: 'es-ES' });
  rtl.fireEvent.changeText(view.getByTestId('translator-input'), 'Where is the station?');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('translator-go')); });
  await rtl.waitFor(() => expect(view.getByTestId('translator-result')).toBeTruthy());
  rtl.fireEvent.press(view.getByTestId('translator-back'));
  expect(view.getByTestId('translator-input').props.value).toBe('¿Dónde está la estación?');
  expect(useTranslator.getState()).toMatchObject({ from: 'es-ES', to: 'en-US' });
  expect(view.queryByTestId('translator-result')).toBeNull();
  rtl.fireEvent.press(view.getByTestId('translator-clear-input'));
  expect(view.getByTestId('translator-input').props.value).toBe('');
});
