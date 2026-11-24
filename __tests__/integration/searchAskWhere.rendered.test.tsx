import { requireRTL } from '../harness/nativeBoundary';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }) }));
// The embedding model is native: a stand-in that turns a text into a count of its words (so texts that share words are alike).
const mockModel = { loaded: false, fail: false };
jest.mock('../../src/services/rag/embedding', () => ({
  embeddingService: {
    load: async () => { if (mockModel.fail) throw new Error('The embedding model could not load.'); mockModel.loaded = true; },
    embed: async (text: string) => {
      const v = new Array(256).fill(0);
      for (const w of text.toLowerCase().match(/[a-z]+/g) ?? []) { let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) % 256; v[h] += 1; }
      return v;
    },
  },
}));

it('finds a screen from a request in plain words, by closeness, and opens it; says so when nothing fits or the model is missing', async () => {
  const rtl = requireRTL();
  const React = require('react');
  const { SearchScreen } = require('../../src/search/SearchScreen');
  const view = rtl.render(React.createElement(SearchScreen));

  rtl.fireEvent.changeText(view.getByTestId('search-input'), 'ab');
  expect(view.queryByTestId('search-ask-ai')).toBeNull(); // too short to ask

  rtl.fireEvent.changeText(view.getByTestId('search-input'), 'exchange rate for euros and my money');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('search-ask-ai')); });
  expect(mockModel.loaded).toBe(true);
  expect(view.getByTestId('search-ai-Currency')).toBeTruthy(); // the stand-in model sees shared words; the real one also sees meaning (14 of 16 test requests right)
  rtl.fireEvent.press(view.getByTestId('search-ai-Currency'));
  expect(mockNavigate).toHaveBeenCalledWith('Currency', undefined);

  // Nothing alike: no screen is offered.
  rtl.fireEvent.changeText(view.getByTestId('search-input'), 'zzzz qqqq xxxx');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('search-ask-ai')); });
  expect(view.getByTestId('search-ask-none')).toBeTruthy();

  // The model cannot load: a plain sentence, and the ordinary search is untouched.
  mockModel.fail = true;
  rtl.fireEvent.changeText(view.getByTestId('search-input'), 'turn the screen darker please');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('search-ask-ai')); });
  expect(view.getByTestId('search-ask-error').props.children).toMatch(/Could not search by meaning: The embedding model could not load/);
});
