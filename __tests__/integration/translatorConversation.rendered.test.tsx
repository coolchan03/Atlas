import { requireRTL } from '../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }), useRoute: () => ({ params: {} }) }));
// The phone's speech recognizer (a device boundary): the first turn hears Spanish, the next waits until the session is stopped.
const mockHeard: string[] = [];
const mockLocales: string[] = [];
jest.mock('../../src/services/systemSpeech', () => ({
  ...jest.requireActual('../../src/services/systemSpeech'),
  systemSpeechStatus: async () => ({ available: true, onDevice: true }),
  listenWithSystemSpeech: async (o: { locale?: string }) => {
    mockLocales.push(String(o.locale));
    const text = mockHeard.shift();
    let cancel!: () => void;
    const result = new Promise<string>((resolve, reject) => {
      if (text !== undefined) resolve(text);
      else cancel = () => reject(new (jest.requireActual('../../src/services/systemSpeech').SpeechCancelled)());
    });
    result.catch(() => undefined);
    return { result, stop: () => undefined, cancel: () => cancel?.() };
  },
}));

it('conversation mode listens in the first language, translates what it heard into the other and shows both, and stops when asked', async () => {
  const rtl = requireRTL();
  const React = require('react');
  const { useAppStore } = require('../../src/stores/appStore');
  const { llmService } = require('../../src/services/llm');
  const { TranslatorScreen } = require('../../src/translator/TranslatorScreen');
  const { useTranslator } = require('../../src/translator/store');

  useAppStore.setState({ downloadedModels: [{ id: 'm1', name: 'Qwen', fileName: 'q.gguf', filePath: '/m/q.gguf', fileSize: 1, engine: 'llama' }], activeModelId: 'm1', loadedTextModelId: 'm1' });
  jest.spyOn(llmService, 'isModelLoaded').mockReturnValue(true);
  jest.spyOn(llmService, 'generateResponse').mockImplementation(async () => 'TO: B\nWhere is the station?');
  mockHeard.push('¿Dónde está la estación?');
  useTranslator.setState({ mode: 'conversation', from: 'es-ES', to: 'en-US', speak: false });

  const view = rtl.render(React.createElement(TranslatorScreen));
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('translator-live-toggle')); });
  await rtl.waitFor(() => expect(view.getByText('Where is the station?')).toBeTruthy());
  expect(view.getByText('¿Dónde está la estación?')).toBeTruthy();
  expect(mockLocales[0]).toBe('es-ES'); // the first turn listens in the first language
  await rtl.waitFor(() => expect(mockLocales[1]).toBe('en-US')); // it was translated into B, so the other person answers next, in B
  // Switching the spoken translation on does not end the session or clear what was said.
  await rtl.act(async () => { rtl.fireEvent(view.getByTestId('translator-speak-switch'), 'valueChange', true); });
  expect(view.getByText('Where is the station?')).toBeTruthy();
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('translator-live-toggle')); });
  expect(view.getByTestId('translator-live-phase').props.children).toBe('Stopped');
  expect(view.getByText('Where is the station?')).toBeTruthy(); // the lines stay after stopping
});
