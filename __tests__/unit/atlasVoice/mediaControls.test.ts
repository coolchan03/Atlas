import { notificationFor, startMediaControls } from '../../../src/atlasVoice/mediaControls';

function fake() {
  let state = { status: 'idle' as 'idle' | 'reading' | 'paused', title: '', parts: [] as string[], index: 0 };
  const listeners: Array<() => void> = [];
  const calls: string[] = [];
  const reader = {
    getState: () => state, subscribe: (l: () => void) => { listeners.push(l); return () => undefined; },
    play: () => calls.push('play'), pause: () => calls.push('pause'), stop: () => calls.push('stop'), jump: (d: number) => calls.push(`jump ${d}`),
  };
  const shown: string[] = [];
  const native = { show: (t: string, x: string, p: boolean) => shown.push(`${t} | ${x} | ${p ? 'playing' : 'paused'}`), hide: () => shown.push('hidden') };
  const set = (s: Partial<typeof state>) => { state = { ...state, ...s }; listeners.forEach((l) => l()); };
  return { reader, native, shown, calls, set };
}

describe('lock-screen controls', () => {
  it('follow the reader: shown while reading or paused with the piece, hidden when it ends', () => {
    const t = fake();
    startMediaControls(t.reader, t.native);
    expect(t.shown).toEqual(['hidden']);
    t.set({ status: 'reading', title: 'Chapter 3', parts: ['a', 'b', 'c'], index: 1 });
    t.set({ status: 'paused' });
    t.set({ status: 'paused' }); // no change: nothing is sent again
    t.set({ status: 'idle', index: 0 });
    expect(t.shown).toEqual(['hidden', 'Chapter 3 | Part 2 of 3 | playing', 'Chapter 3 | Part 2 of 3 | paused', 'hidden']);
    expect(notificationFor({ status: 'reading', title: '', parts: [], index: 0 })).toBeNull();
  });

  it('turns a press into the same call the Read Aloud buttons make', () => {
    const t = fake();
    const { press } = startMediaControls(t.reader, t.native);
    (['play', 'pause', 'next', 'previous', 'stop'] as const).forEach(press);
    expect(t.calls).toEqual(['play', 'pause', 'jump 1', 'jump -1', 'stop']);
  });
});
