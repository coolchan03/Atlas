/** Every instrument and drum makes sound that is finite, audible and different from the others. */
import { DRUM_KINDS, isDrumKind, isVoiceName, noteWave } from '../../../src/music/instruments';

const VOICES = ['piano', 'epiano', 'pluck', 'driven', 'organ', 'bell', 'saw', 'pad', 'bass', 'sine', 'flute', 'clarinet', 'oboe', 'violin', 'cello', 'trumpet', 'horn', 'sax', 'harp', 'marimba', 'vibes', 'glock', 'kalimba', 'musicbox', 'accordion', 'harmonica', 'banjo', 'steeldrum', 'choir', 'harpsichord', 'upright', 'squarelead', 'synthpluck', 'warmpad', 'glasspad'];
const RATE = 24000;
const rms = (w: Float32Array) => Math.sqrt(w.reduce((s, x) => s + x * x, 0) / w.length);

describe('instruments', () => {
  it.each(VOICES)('%s plays a note that is finite, audible and not clipped', (voice) => {
    const wave = noteWave({ pitch: 60, beat: 0, length: 1, gain: 0.6, voice: voice as never }, { samples: RATE, rate: RATE, preset: 'keys' });
    expect(wave.every(Number.isFinite)).toBe(true);
    expect(rms(wave)).toBeGreaterThan(0.001);
    expect(Math.max(...wave.map(Math.abs))).toBeLessThan(4);
  });

  it('knows which names are instruments and which are drums', () => {
    for (const v of VOICES) expect(isVoiceName(v)).toBe(true);
    expect(isVoiceName('kazoo')).toBe(false);
    expect(isVoiceName('toString')).toBe(false);
    for (const d of DRUM_KINDS) expect(isDrumKind(d)).toBe(true);
    expect(isDrumKind('piano')).toBe(false);
  });

  it('plays each drum as a short audible hit', () => {
    for (const kind of DRUM_KINDS) {
      const wave = noteWave({ pitch: 48, beat: 0, length: 0.5, gain: 0.7, role: 'perc', voice: kind }, { samples: 12000, rate: RATE, preset: 'keys' });
      expect(wave.every(Number.isFinite)).toBe(true);
      expect(rms(wave)).toBeGreaterThan(0.001);
    }
  });

  it('makes different instruments sound different, and keeps the old pitch-based drums when no kind is named', () => {
    const a = noteWave({ pitch: 64, beat: 0, length: 1, gain: 0.5, voice: 'flute' }, { samples: 8000, rate: RATE, preset: 'keys' });
    const b = noteWave({ pitch: 64, beat: 0, length: 1, gain: 0.5, voice: 'trumpet' }, { samples: 8000, rate: RATE, preset: 'keys' });
    expect(a.some((x, i) => Math.abs(x - b[i]) > 0.01)).toBe(true);
    const old = noteWave({ pitch: 40, beat: 0, length: 0.5, gain: 0.7, role: 'perc' }, { samples: 6000, rate: RATE, preset: 'keys' });
    expect(rms(old)).toBeGreaterThan(0.001);
  });
});
