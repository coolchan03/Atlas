import { requireRTL } from '../harness/nativeBoundary';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }), useRoute: () => ({ params: {} }) }));

it('starts a trip, translates the basic phrases for its language, ticks off packing, and carries the language and money into the Translator and Currency screens', async () => {
  const rtl = requireRTL();
  const React = require('react');
  const { TripScreen } = require('../../src/trip/TripScreen');
  const { useTrips, BASIC_PHRASES, STARTER_PACKING } = require('../../src/trip/store');
  const { useTranslator } = require('../../src/translator/store');
  const { useCurrency } = require('../../src/currency/store');
  const { useAppStore } = require('../../src/stores/appStore');
  const { llmService } = require('../../src/services/llm');
  useTrips.setState({ trips: [], activeId: null });
  useAppStore.setState({ downloadedModels: [{ id: 'm1', name: 'Qwen', fileName: 'q.gguf', filePath: '/m/q.gguf', fileSize: 1, engine: 'llama' }], activeModelId: 'm1', loadedTextModelId: 'm1' });
  jest.spyOn(llmService, 'isModelLoaded').mockReturnValue(true);
  const asked: string[] = [];
  jest.spyOn(llmService, 'generateResponse').mockImplementation(async (messages: any) => { const said = messages[1].content; asked.push(messages[0].content); return `Translation: "${said} (em português)"`; });

  const view = rtl.render(React.createElement(TripScreen));
  expect(view.queryByTestId('trip-title')).toBeNull();
  expect(view.getByTestId('trip-start').props.accessibilityState?.disabled).toBe(true);
  rtl.fireEvent.changeText(view.getByTestId('trip-name'), 'Lisbon in May');
  rtl.fireEvent.press(view.getByTestId('trip-start'));
  expect(view.getByTestId('trip-title').props.children).toBe('Lisbon in May');
  expect(useTrips.getState().trips[0].packing).toHaveLength(STARTER_PACKING.length);

  rtl.fireEvent.press(view.getByTestId('trip-language'));
  rtl.fireEvent.press(view.getByTestId('trip-language-pt-BR'));
  rtl.fireEvent.press(view.getByTestId('trip-currency'));
  rtl.fireEvent.press(view.getByTestId('trip-currency-EUR'));
  rtl.fireEvent.press(view.getByTestId('trip-home'));
  rtl.fireEvent.press(view.getByTestId('trip-home-GBP'));
  const trip = useTrips.getState().trips[0];
  expect(trip).toMatchObject({ language: 'pt-BR', currency: 'EUR', home: 'GBP' });

  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('trip-basics')); });
  await rtl.waitFor(() => expect(useTrips.getState().trips[0].phrases).toHaveLength(BASIC_PHRASES.length));
  expect(asked[0]).toMatch(/Portuguese/);
  expect(useTrips.getState().trips[0].phrases[4]).toMatchObject({ text: 'Where is the bathroom?', translation: 'Where is the bathroom? (em português)' });
  expect(view.queryByTestId('trip-basics')).toBeNull(); // only offered while the list is empty

  // A phrase of your own, once; the same one again is not added twice.
  rtl.fireEvent.changeText(view.getByTestId('trip-phrase'), 'A table for two, please');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('trip-phrase-add')); });
  await rtl.waitFor(() => expect(useTrips.getState().trips[0].phrases).toHaveLength(BASIC_PHRASES.length + 1));
  rtl.fireEvent.changeText(view.getByTestId('trip-phrase'), 'a table for two, please');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('trip-phrase-add')); });
  expect(useTrips.getState().trips[0].phrases).toHaveLength(BASIC_PHRASES.length + 1);

  // Packing: tick one, add one.
  rtl.fireEvent.press(view.getByTestId('trip-pack-p0'));
  rtl.fireEvent.changeText(view.getByTestId('trip-pack-input'), 'Sunscreen');
  rtl.fireEvent.press(view.getByTestId('trip-pack-add'));
  expect(useTrips.getState().trips[0].packing[0].done).toBe(true);
  expect(useTrips.getState().trips[0].packing.map((p: { text: string }) => p.text)).toContain('Sunscreen');

  // The trip's language and money go with you.
  rtl.fireEvent.press(view.getByTestId('trip-translator'));
  expect(useTranslator.getState()).toMatchObject({ to: 'pt-BR', mode: 'text' });
  expect(mockNavigate).toHaveBeenLastCalledWith('Translator');
  rtl.fireEvent.press(view.getByTestId('trip-money'));
  expect(useCurrency.getState()).toMatchObject({ from: 'GBP', to: 'EUR' });
  expect(mockNavigate).toHaveBeenLastCalledWith('Currency');
  rtl.fireEvent.press(view.getByTestId('trip-link-Maps'));
  expect(mockNavigate).toHaveBeenLastCalledWith('Maps');

  // A second trip is picked from a list; deleting a trip falls back to the other.
  rtl.fireEvent.changeText(view.getByTestId('trip-name'), 'Berlin');
  rtl.fireEvent.press(view.getByTestId('trip-start'));
  expect(useTrips.getState().trips).toHaveLength(2);
  rtl.fireEvent.press(view.getByTestId('trip-delete'));
  expect(view.getByTestId('trip-title').props.children).toBe('Lisbon in May');
});
