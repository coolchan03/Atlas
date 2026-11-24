/** Music Studio: "Make my own", chosen in the Made by drop-down, opens the note editor on a blank page or a preset, so you write the tune yourself. */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));

it('offers a blank page and presets, and opens the editor on the one you pick', () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { MusicStudioScreen } = require('../../../src/screens/MusicStudioScreen');
  const view = rtl.render(React.createElement(MusicStudioScreen));
  expect(view.queryByTestId('music-own')).toBeNull(); // only once "Make my own" is chosen
  rtl.fireEvent.press(view.getByTestId('music-maker'));
  rtl.fireEvent.press(view.getByTestId('music-maker-own'));
  expect(view.queryByTestId('music-prompt')).toBeNull(); // no prompt, styles or make button on this page
  expect(view.queryByTestId('music-ai-composer')).toBeNull();
  rtl.fireEvent.press(view.getByTestId('music-own'));
  for (const id of ['blank', 'beat', 'pop', 'lofi', 'blues', 'ballad']) expect(view.queryByTestId(`music-own-${id}`)).not.toBeNull();
  rtl.fireEvent.press(view.getByTestId('music-own-lofi'));
  expect(mockNavigate).toHaveBeenCalledWith('ScoreEditor', { score: expect.objectContaining({ title: 'My lo-fi loop', bpm: 76 }) });
  const { score } = mockNavigate.mock.calls[0][1];
  expect(score.notes.some((n: { role: string }) => n.role === 'perc')).toBe(true);
});
