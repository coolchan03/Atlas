import { requireRTL } from '../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }), useRoute: () => ({ params: {} }) }));

it('lets the theme, name, poems, song length and host be set, and shows the song playing with its poem while it is read', () => {
  const rtl = requireRTL();
  const React = require('react');
  const { RadioScreen } = require('../../src/radio/RadioScreen');
  const { useRadioSettings, useRadioRun, EMPTY_RUN } = require('../../src/radio/store');
  const view = rtl.render(React.createElement(RadioScreen));

  rtl.fireEvent.changeText(view.getByTestId('radio-theme'), 'a haunted lighthouse late-night station');
  rtl.fireEvent.changeText(view.getByTestId('radio-name'), 'Lamp FM');
  rtl.fireEvent.press(view.getByTestId('radio-poems'));
  rtl.fireEvent.press(view.getByTestId('radio-poems-0.6'));
  rtl.fireEvent.press(view.getByTestId('radio-length'));
  rtl.fireEvent.press(view.getByTestId('radio-length-300'));
  rtl.fireEvent.press(view.getByTestId('radio-host'));
  rtl.fireEvent.press(view.getByTestId('radio-host-off'));
  expect(useRadioSettings.getState()).toMatchObject({ theme: 'a haunted lighthouse late-night station', stationName: 'Lamp FM', poemChance: 0.6, musicOnly: false, maxSongSeconds: 300, host: false });

  // "Never" means music only.
  rtl.fireEvent.press(view.getByTestId('radio-poems'));
  rtl.fireEvent.press(view.getByTestId('radio-poems-0'));
  expect(useRadioSettings.getState().musicOnly).toBe(true);

  // Before the station starts there is a Start button and nothing playing.
  expect(view.getByTestId('radio-start')).toBeTruthy();
  expect(view.queryByTestId('radio-now')).toBeNull();

  // While it runs: the song, what it is about, and the poem once it is being read.
  rtl.act(() => { useRadioRun.setState({ ...EMPTY_RUN, on: true, line: 'Playing', title: 'Silly punk: revenge', about: 'silly punk song about revenge, about my ex-husband', poem: ['The lamp went out at half past nine', 'The ghost of me was doing fine'], reading: false, songs: 1 }); });
  expect(view.getByTestId('radio-title').props.children).toBe('Silly punk: revenge');
  expect(view.queryByTestId('radio-poem')).toBeNull();
  expect(view.getByTestId('radio-stop')).toBeTruthy();
  expect(view.getByTestId('radio-skip')).toBeTruthy();
  rtl.act(() => { useRadioRun.setState({ reading: true }); });
  expect(view.getByTestId('radio-poem').props.children).toContain('The ghost of me was doing fine');
  rtl.act(() => { useRadioRun.setState({ ...EMPTY_RUN, problem: 'No model is loaded.' }); });
  expect(view.getByTestId('radio-problem').props.children).toBe('No model is loaded.');

  // Running: ask for a song, keep it, and set the sleep timer (and turn it off again so no timer is left).
  const { useMusicPlayback } = require('../../src/music/backgroundPlayer');
  rtl.act(() => { useRadioRun.setState({ ...EMPTY_RUN, on: true, line: 'Playing', title: 'Calm folk: a long nap', about: 'calm folk song' }); });
  expect(view.getByTestId('radio-keep').props.accessibilityState?.disabled).toBeFalsy();
  rtl.act(() => { useMusicPlayback.setState({ current: { id: 'track-1', title: 'Calm folk' } }); });
  rtl.fireEvent.press(view.getByTestId('radio-keep'));
  expect(useRadioRun.getState().kept).toBe(true);
  rtl.fireEvent.changeText(view.getByTestId('radio-request'), 'a lost umbrella');
  rtl.fireEvent.press(view.getByTestId('radio-request-go'));
  expect(view.getByTestId('radio-request-note').props.children).toBe('Next song: a lost umbrella');
  rtl.fireEvent.changeText(view.getByTestId('radio-request'), 'a shit song');
  rtl.fireEvent.press(view.getByTestId('radio-request-go'));
  expect(useRadioRun.getState().request).toBe('a lost umbrella'); // the unsuitable one was not queued
  rtl.fireEvent.press(view.getByTestId('radio-sleep'));
  rtl.fireEvent.press(view.getByTestId('radio-sleep-30'));
  expect(useRadioRun.getState().sleepAt).toBeGreaterThan(Date.now() + 29 * 60_000);
  expect(view.getByTestId('radio-sleep-note')).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('radio-sleep'));
  rtl.fireEvent.press(view.getByTestId('radio-sleep-0'));
  expect(useRadioRun.getState().sleepAt).toBeNull();
  rtl.fireEvent.press(view.getByTestId('radio-mood'));
  rtl.fireEvent.press(view.getByTestId('radio-mood-calm'));
  expect(useRadioSettings.getState().calmOnly).toBe(true);
});
