import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

const track = (id: string) => ({ id, title: `Track ${id}`, path: `/music/${id}.wav`, scorePath: `/music/${id}.json`, mood: 'calm', sound: 'piano', seconds: 90, createdAt: '2026-01-01' });

async function setup(state: { tracks?: number; playing?: boolean; paused?: boolean; current?: boolean; fails?: boolean }) {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const player = { pause: jest.fn(), resume: jest.fn(async () => { if (state.fails) throw new Error('no audio'); }), play: jest.fn(async () => { if (state.fails) throw new Error('no audio'); }), next: jest.fn(async () => { if (state.fails) throw new Error('no next'); }) };
  const playback = require('zustand').create(() => ({ current: state.current ? track('a') : null, playing: !!state.playing, paused: !!state.paused, error: null, ducked: false }));
  jest.doMock('../../../src/music/backgroundPlayer', () => ({ instrumentalPlayer: player, useMusicPlayback: playback }));
  require('../../../src/music/library').useMusicLibrary.setState({ tracks: Array.from({ length: state.tracks ?? 0 }, (_, i) => track(String(i))) });
  const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => undefined);
  const openStudio = jest.fn();
  const { MusicPlayerWidget } = require('../../../src/screens/HomeScreen/MusicPlayerWidget');
  const view = rtl.render(React.createElement(MusicPlayerWidget, { openStudio }));
  const press = async (id: string) => { await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId(id)); }); await rtl.act(async () => { await new Promise((r) => setImmediate(r)); }); };
  return { view, press, player, openStudio, alert };
}

describe('the music widget on Home', () => {
  it('opens the studio when nothing is saved, and when the open button is pressed', async () => {
    const { press, openStudio, view } = await setup({ tracks: 0 });
    expect(view.getByText(/0 saved tracks/)).toBeTruthy();
    await press('widget-music-toggle');
    expect(openStudio).toHaveBeenCalledTimes(1);
    await press('widget-music-open');
    expect(openStudio).toHaveBeenCalledTimes(2);
  });

  it('plays the first saved track, or the current one, or resumes, or pauses', async () => {
    const first = await setup({ tracks: 2 });
    expect(first.view.getByText(/2 saved tracks/)).toBeTruthy();
    await first.press('widget-music-toggle');
    expect(first.player.play).toHaveBeenCalledWith(expect.objectContaining({ id: '0' }));
    await first.press('widget-music-next');
    expect(first.player.next).toHaveBeenCalled();
    const current = await setup({ tracks: 2, current: true });
    await current.press('widget-music-toggle');
    expect(current.player.play).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    const paused = await setup({ tracks: 1, current: true, paused: true });
    expect(paused.view.getByText('Paused')).toBeTruthy();
    await paused.press('widget-music-toggle');
    expect(paused.player.resume).toHaveBeenCalled();
    const playing = await setup({ tracks: 1, current: true, playing: true });
    expect(playing.view.getByText('Playing')).toBeTruthy();
    await playing.press('widget-music-toggle');
    expect(playing.player.pause).toHaveBeenCalled();
  });

  it('shows a readable message when playback fails', async () => {
    const play = await setup({ tracks: 1, fails: true });
    await play.press('widget-music-toggle');
    expect(play.alert).toHaveBeenCalledWith('Music playback', 'no audio');
    await play.press('widget-music-next');
    expect(play.alert).toHaveBeenCalledWith('Music playback', 'no next');
    const resume = await setup({ tracks: 1, current: true, paused: true, fails: true });
    await resume.press('widget-music-toggle');
    expect(resume.alert).toHaveBeenCalledWith('Music playback', 'no audio');
  });
});
