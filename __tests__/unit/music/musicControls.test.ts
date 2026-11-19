import { musicNotification, startMusicControls } from '../../../src/music/musicControls';
import { claimMedia, ownsMedia, releaseMedia } from '../../../src/atlasVoice/mediaOwner';

function fixture(background = true) {
  let state = { current: null as { title: string } | null, playing: false, paused: false };
  const listeners = new Set<() => void>();
  const player = { getState: () => state, subscribe: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); }, play: jest.fn(), pause: jest.fn(), stop: jest.fn(), next: jest.fn(), previous: jest.fn() };
  const native = { show: jest.fn(), hide: jest.fn(), keepAlive: jest.fn() };
  const set = (next: Partial<typeof state>) => { state = { ...state, ...next }; listeners.forEach((l) => l()); };
  const controls = startMusicControls(player, native, () => background);
  return { player, native, set, controls };
}

describe('music in the phone\'s media controls', () => {
  beforeEach(() => { while (ownsMedia('music') || ownsMedia('reader')) { releaseMedia('music'); releaseMedia('reader'); } });

  it('shows the title while a track plays or is paused, and nothing when none is loaded', () => {
    expect(musicNotification({ current: null, playing: false, paused: false })).toBeNull();
    expect(musicNotification({ current: { title: 'Rain' }, playing: false, paused: false })).toBeNull();
    expect(musicNotification({ current: { title: 'Rain' }, playing: true, paused: false })).toEqual({ title: 'Rain', text: 'Atlas Music Studio', playing: true });
    expect(musicNotification({ current: { title: 'Rain' }, playing: false, paused: true })?.playing).toBe(false);
  });

  it('holds Atlas in the foreground only while it plays, and lets go when paused or stopped', () => {
    const { native, set } = fixture();
    set({ current: { title: 'Rain' }, playing: true });
    expect(native.show).toHaveBeenLastCalledWith('Rain', 'Atlas Music Studio', true);
    expect(native.keepAlive).toHaveBeenLastCalledWith(true);
    set({ playing: false, paused: true });
    expect(native.show).toHaveBeenLastCalledWith('Rain', 'Atlas Music Studio', false);
    expect(native.keepAlive).toHaveBeenLastCalledWith(false);
    set({ paused: false, current: null });
    expect(native.hide).toHaveBeenCalledTimes(1);
  });

  it('does not hold Atlas in the foreground when "keep playing in the background" is off', () => {
    const { native, set } = fixture(false);
    set({ current: { title: 'Rain' }, playing: true });
    expect(native.show).toHaveBeenCalled();
    expect(native.keepAlive).toHaveBeenLastCalledWith(false);
  });

  it('answers the buttons while it owns the controls, and ignores them when the reader does', () => {
    const { player, set, controls } = fixture();
    set({ current: { title: 'Rain' }, playing: true });
    controls.press('pause'); controls.press('next'); controls.press('previous'); controls.press('play'); controls.press('stop');
    expect([player.pause, player.next, player.previous, player.play, player.stop].map((f) => f.mock.calls.length)).toEqual([1, 1, 1, 1, 1]);
    claimMedia('reader');
    controls.press('pause');
    expect(player.pause).toHaveBeenCalledTimes(1);
  });

  it('takes the notification down on stop only if it still owns it', () => {
    const { native, controls, set } = fixture();
    set({ current: { title: 'Rain' }, playing: true });
    claimMedia('reader');
    controls.stop();
    expect(native.hide).not.toHaveBeenCalled(); // the reader owns the notification now
  });
});
