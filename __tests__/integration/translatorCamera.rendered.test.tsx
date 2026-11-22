import { requireRTL } from '../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }), useRoute: () => ({ params: {} }) }));
// The camera (a device boundary) hands back one photo.
jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(async () => ({ assets: [{ uri: 'file:///photo/exit.jpg', type: 'image/jpeg' }] })),
  launchImageLibrary: jest.fn(async () => ({ assets: [] })),
}));

it('camera mode says so when the model cannot see pictures, and reads and translates the text in a picture when it can', async () => {
  const rtl = requireRTL();
  const React = require('react');
  const { useAppStore } = require('../../src/stores/appStore');
  const { llmService } = require('../../src/services/llm');
  const { TranslatorScreen } = require('../../src/translator/TranslatorScreen');
  const { useTranslator } = require('../../src/translator/store');

  useAppStore.setState({ downloadedModels: [{ id: 'm1', name: 'Qwen', fileName: 'q.gguf', filePath: '/m/q.gguf', fileSize: 1, engine: 'llama' }], activeModelId: 'm1', loadedTextModelId: 'm1' });
  jest.spyOn(llmService, 'isModelLoaded').mockReturnValue(true);
  const vision = jest.spyOn(llmService, 'supportsVision').mockReturnValue(false);
  const asked: any[][] = [];
  jest.spyOn(llmService, 'generateResponse').mockImplementation(async (messages: any) => { asked.push(messages); return 'ORIGINAL:\nSalida\nTRANSLATION:\nExit'; });
  useTranslator.setState({ mode: 'camera', to: 'en-US' });

  const view = rtl.render(React.createElement(TranslatorScreen));
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('translator-take-photo')); });
  await rtl.waitFor(() => expect(view.getByTestId('translator-error')).toBeTruthy());
  expect(view.getByTestId('translator-error').props.children).toMatch(/cannot see pictures/);
  expect(asked).toHaveLength(0);

  vision.mockReturnValue(true);
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('translator-take-photo')); });
  await rtl.waitFor(() => expect(view.getByTestId('translator-picture-result')).toBeTruthy());
  expect(view.getByText('Exit')).toBeTruthy();
  expect(view.getByText('Salida')).toBeTruthy();
  expect(asked[0][0].attachments[0]).toMatchObject({ type: 'image', uri: 'file:///photo/exit.jpg' });
  expect(asked[0][0].content).toMatch(/into English/);
});
