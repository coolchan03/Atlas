import { requireRTL } from '../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }), useRoute: () => ({ params: {} }) }));

const open = async (width: number) => {
  jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width, height: 900, scale: 2, fontScale: 1 });
  const rtl = requireRTL();
  const React = require('react');
  const { useAppStore } = require('../../src/stores/appStore');
  const { llmService } = require('../../src/services/llm');
  const { TranslatorScreen } = require('../../src/translator/TranslatorScreen');
  const { useTranslator } = require('../../src/translator/store');
  useAppStore.setState({ downloadedModels: [{ id: 'm1', name: 'Qwen', fileName: 'q.gguf', filePath: '/m/q.gguf', fileSize: 1, engine: 'llama' }], activeModelId: 'm1', loadedTextModelId: 'm1' });
  jest.spyOn(llmService, 'isModelLoaded').mockReturnValue(true);
  jest.spyOn(llmService, 'generateResponse').mockImplementation(async () => 'Hola');
  useTranslator.setState({ mode: 'text', from: 'en-US', to: 'es-ES', history: [] });
  const view = rtl.render(React.createElement(TranslatorScreen));
  rtl.fireEvent.changeText(view.getByTestId('translator-input'), 'Hello');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('translator-go')); });
  await rtl.waitFor(() => expect(view.getByTestId('translator-result')).toBeTruthy());
  return view;
};

it('puts the translation beside the text on a tablet, and below it on a phone', async () => {
  const tablet = await open(1100);
  expect(tablet.getByTestId('translator-panes')).toHaveStyle({ flexDirection: 'row' });
  tablet.unmount();
  const phone = await open(400);
  expect(phone.getByTestId('translator-panes')).not.toHaveStyle({ flexDirection: 'row' });
});
