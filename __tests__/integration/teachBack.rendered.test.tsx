import { requireRTL } from '../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));
const mockShaped = jest.fn();
jest.mock('../../src/study/engine', () => ({ askShaped: (...a: unknown[]) => mockShaped(...a), askModel: jest.fn() }));
jest.mock('../../src/services/rag/embedding', () => ({
  embeddingService: {
    load: async () => undefined,
    embed: async (text: string) => { const v = new Array(256).fill(0); for (const w of text.toLowerCase().match(/[a-z]+/g) ?? []) { let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) % 256; v[h] += 1; } return v; },
  },
}));

const SOURCE = [
  'Photosynthesis happens inside chloroplasts, which contain the green pigment chlorophyll in 2 membranes.',
  'The light reactions capture sunlight energy and split water, releasing oxygen as a waste gas.',
  'The Calvin cycle then uses 3 molecules of carbon dioxide, building sugar from the captured energy.',
  'Plants store the sugar as starch, which they use at night when there is no sunlight at all.',
].join('\n\n');

it('shows which key points of the source were covered and which were missed, decided by code, then the tutor asks about the first missed point', async () => {
  const rtl = requireRTL();
  const React = require('react');
  const { TeachBackScreen } = require('../../src/teachback/TeachBackScreen');
  const view = rtl.render(React.createElement(TeachBackScreen));
  expect(view.getByTestId('teachback-check').props.accessibilityState?.disabled).toBe(true);
  rtl.fireEvent.changeText(view.getByTestId('teachback-source'), SOURCE);
  rtl.fireEvent.changeText(view.getByTestId('teachback-explain'),
    'Photosynthesis happens inside chloroplasts, which contain the green pigment chlorophyll. The light reactions capture sunlight energy and split water, releasing oxygen.');
  mockShaped.mockResolvedValueOnce('You explained the light reactions well. What does the plant build with the energy afterwards?');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('teachback-check')); });

  expect(view.getByTestId('teachback-score').props.children).toBe('YOU COVERED 2 OF 4 KEY POINTS');
  expect(view.getByTestId('teachback-point-0-covered')).toBeTruthy();
  expect(view.getByTestId('teachback-point-1-covered')).toBeTruthy();
  expect(view.getByTestId('teachback-point-2-missed')).toBeTruthy();
  expect(view.getByTestId('teachback-point-3-missed')).toBeTruthy();
  const [, user] = mockShaped.mock.calls[0];
  expect(user).toMatch(/Points missed:\n- The Calvin cycle/);
  expect(view.getByTestId('teachback-note').props.children).toMatch(/What does the plant build/);
});
